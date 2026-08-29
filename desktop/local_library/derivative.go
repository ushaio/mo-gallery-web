package local_library

import (
	"container/heap"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	derivativeContentVersion = "1"
	derivativeDecoderVersion = "go-image-v1"
	thumbnailMaxDimension    = 512
	previewMaxDimension      = 2048
	defaultPreviewCacheBytes = int64(2 * 1024 * 1024 * 1024)
)

var errDerivativeSourceChanged = errors.New("source changed while derivative was queued")

type derivativeVariant string

const (
	derivativeThumbnail derivativeVariant = "thumbnail"
	derivativePreview   derivativeVariant = "preview"
)

type derivativePriority int

const (
	derivativePriorityBackground derivativePriority = iota + 1
	derivativePriorityVisible
	derivativePrioritySelected
)

type derivativeSource struct {
	RelativePath string
	MimeType     string
	Availability string
	ModifiedAtNS int64
	ByteSize     int64
	Orientation  int
	Format       string
	Extension    string
}

type derivativeRequest struct {
	assetID  AssetID
	variant  derivativeVariant
	priority derivativePriority
	cacheKey string
	source   derivativeSource
}

type derivativeResult struct {
	path   string
	mime   string
	status string
	err    error
}

type derivativeFlight struct {
	request derivativeRequest
	key     string
	done    chan struct{}
	result  derivativeResult
	index   int
	order   uint64
}

type derivativeQueue []*derivativeFlight

func (q derivativeQueue) Len() int { return len(q) }
func (q derivativeQueue) Less(i, j int) bool {
	if q[i].request.priority == q[j].request.priority {
		return q[i].order < q[j].order
	}
	return q[i].request.priority > q[j].request.priority
}
func (q derivativeQueue) Swap(i, j int) {
	q[i], q[j] = q[j], q[i]
	q[i].index, q[j].index = i, j
}
func (q *derivativeQueue) Push(value any) {
	flight := value.(*derivativeFlight)
	flight.index = len(*q)
	*q = append(*q, flight)
}
func (q *derivativeQueue) Pop() any {
	old := *q
	last := len(old) - 1
	flight := old[last]
	old[last] = nil
	flight.index = -1
	*q = old[:last]
	return flight
}

type derivativeScheduler struct {
	ctx       context.Context
	run       func(context.Context, derivativeRequest) derivativeResult
	mu        sync.Mutex
	queue     derivativeQueue
	flights   map[string]*derivativeFlight
	wake      chan struct{}
	stop      chan struct{}
	stopOnce  sync.Once
	nextOrder uint64
	writer    *derivativeWriter
}

// derivativeWriter coalesces the bookkeeping writes produced by thumbnail
// generation. Warming a large library used to cost up to seven small write
// transactions per image (two status rows, a preview status, a dominant-colour
// update and cache touches), all serialized on the single library.db writer.
// Batching them turns a 50k-image warm-up into a few hundred commits.
type derivativeWriter struct {
	store    *store
	emit     func(id AssetID, status string)
	mu       sync.Mutex
	pending  map[string]derivativeWrite
	previews map[AssetID]previewWrite
	order    []AssetID
	flushMu  sync.Mutex
}

const derivativeWriteBatchSize = 128

func newDerivativeWriter(database *store, emit func(id AssetID, status string)) *derivativeWriter {
	return &derivativeWriter{
		store:    database,
		emit:     emit,
		pending:  make(map[string]derivativeWrite),
		previews: make(map[AssetID]previewWrite),
	}
}

func derivativeWriteKey(id AssetID, variant derivativeVariant) string {
	return string(id) + "\x00" + string(variant)
}

// record queues a derivative row and, for thumbnails, the matching preview
// state. It returns immediately; the batch is committed once it is full or when
// flush is called. emitEvent is false for the bulk initialization warm-up, where
// one event per image would flood the frontend with re-renders while the
// progress overlay is showing.
func (w *derivativeWriter) record(ctx context.Context, write derivativeWrite, preview *previewWrite, emitEvent bool) {
	if w == nil {
		return
	}
	w.mu.Lock()
	w.pending[derivativeWriteKey(write.AssetID, write.Variant)] = write
	if preview != nil {
		if _, exists := w.previews[preview.ID]; !exists {
			w.order = append(w.order, preview.ID)
		}
		w.previews[preview.ID] = *preview
	}
	full := len(w.pending) >= derivativeWriteBatchSize || len(w.previews) >= derivativeWriteBatchSize
	w.mu.Unlock()
	if preview != nil && emitEvent && w.emit != nil {
		w.emit(preview.ID, preview.Status)
	}
	if full {
		w.flush(ctx)
	}
}

// lookup reports a queued derivative row so a concurrent request does not
// regenerate a thumbnail whose row has not been committed yet.
func (w *derivativeWriter) lookup(id AssetID, variant derivativeVariant) (derivativeWrite, bool) {
	if w == nil {
		return derivativeWrite{}, false
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	write, ok := w.pending[derivativeWriteKey(id, variant)]
	return write, ok
}

func (w *derivativeWriter) flush(ctx context.Context) {
	if w == nil {
		return
	}
	w.flushMu.Lock()
	defer w.flushMu.Unlock()
	w.mu.Lock()
	if len(w.pending) == 0 && len(w.previews) == 0 {
		w.mu.Unlock()
		return
	}
	derivatives := make([]derivativeWrite, 0, len(w.pending))
	for _, write := range w.pending {
		derivatives = append(derivatives, write)
	}
	previews := make([]previewWrite, 0, len(w.previews))
	for _, id := range w.order {
		if write, ok := w.previews[id]; ok {
			previews = append(previews, write)
		}
	}
	w.pending = make(map[string]derivativeWrite)
	w.previews = make(map[AssetID]previewWrite)
	w.order = w.order[:0]
	w.mu.Unlock()
	if err := w.store.derivatives.setResults(ctx, derivatives); err != nil {
		log.Printf("[local-library] flush derivative rows: %v", err)
	}
	if err := w.store.setPreviewResults(ctx, previews); err != nil {
		log.Printf("[local-library] flush preview states: %v", err)
	}
}

func newDerivativeScheduler(session *librarySession, workers int, run func(context.Context, derivativeRequest) derivativeResult, writer *derivativeWriter) *derivativeScheduler {
	if workers < 1 {
		workers = 1
	}
	scheduler := &derivativeScheduler{
		ctx:     session.ctx,
		run:     run,
		flights: make(map[string]*derivativeFlight),
		wake:    make(chan struct{}, 1),
		stop:    make(chan struct{}),
		writer:  writer,
	}
	heap.Init(&scheduler.queue)
	for range workers {
		session.startWorker(scheduler.worker)
	}
	session.startWorker(scheduler.flushLoop)
	return scheduler
}

// flushLoop commits coalesced bookkeeping while generation is in flight so an
// interactive session never keeps ready thumbnails unrecorded for long.
func (s *derivativeScheduler) flushLoop() {
	ticker := time.NewTicker(400 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-s.stop:
			s.flushWrites(context.Background())
			return
		case <-s.ctx.Done():
			s.flushWrites(context.Background())
			return
		case <-ticker.C:
			s.flushWrites(s.ctx)
		}
	}
}

func (s *derivativeScheduler) flushWrites(ctx context.Context) {
	if s == nil || s.writer == nil {
		return
	}
	s.writer.flush(ctx)
}

func (s *derivativeScheduler) close() {
	s.stopOnce.Do(func() {
		close(s.stop)
		s.cancelPending()
		s.signal()
	})
}

func (s *derivativeScheduler) submit(ctx context.Context, request derivativeRequest, wait bool) derivativeResult {
	select {
	case <-s.stop:
		return derivativeResult{status: "cancelled", err: context.Canceled}
	default:
	}
	key := request.cacheKey
	s.mu.Lock()
	select {
	case <-s.stop:
		s.mu.Unlock()
		return derivativeResult{status: "cancelled", err: context.Canceled}
	default:
	}
	flight := s.flights[key]
	if flight != nil {
		if request.priority > flight.request.priority && flight.index >= 0 {
			flight.request.priority = request.priority
			heap.Fix(&s.queue, flight.index)
		}
	} else {
		s.nextOrder++
		flight = &derivativeFlight{request: request, key: key, done: make(chan struct{}), index: -1, order: s.nextOrder}
		s.flights[key] = flight
		heap.Push(&s.queue, flight)
	}
	s.mu.Unlock()
	s.signal()
	if !wait {
		return derivativeResult{status: "queued"}
	}
	select {
	case <-flight.done:
		return flight.result
	case <-ctx.Done():
		return derivativeResult{status: "cancelled", err: ctx.Err()}
	case <-s.stop:
		return derivativeResult{status: "cancelled", err: context.Canceled}
	}
}

func (s *derivativeScheduler) signal() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

func (s *derivativeScheduler) worker() {
	for {
		flight := s.next()
		if flight == nil {
			return
		}
		result := s.run(s.ctx, flight.request)
		s.mu.Lock()
		flight.result = result
		delete(s.flights, flight.key)
		close(flight.done)
		s.mu.Unlock()
	}
}

func (s *derivativeScheduler) next() *derivativeFlight {
	for {
		s.mu.Lock()
		if len(s.queue) > 0 {
			flight := heap.Pop(&s.queue).(*derivativeFlight)
			s.mu.Unlock()
			return flight
		}
		s.mu.Unlock()
		select {
		case <-s.stop:
			return nil
		case <-s.wake:
		}
	}
}

func (s *derivativeScheduler) cancelPending() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for len(s.queue) > 0 {
		flight := heap.Pop(&s.queue).(*derivativeFlight)
		flight.result = derivativeResult{status: "cancelled", err: context.Canceled}
		delete(s.flights, flight.key)
		close(flight.done)
	}
}

// derivativeCacheKeyLength is the hex length of the digest derivativeCacheKey
// returns (16 bytes of SHA-256).
const derivativeCacheKeyLength = 32

func derivativeCacheKey(id AssetID, modifiedAtNS, byteSize int64, variant derivativeVariant) string {
	payload := fmt.Sprintf("%s\x00%d\x00%d\x00%s\x00%s\x00%s", id, modifiedAtNS, byteSize, derivativeContentVersion, variant, derivativeDecoderVersion)
	sum := sha256.Sum256([]byte(payload))
	return hex.EncodeToString(sum[:16])
}

func derivativeDimension(variant derivativeVariant) int {
	if variant == derivativePreview {
		return previewMaxDimension
	}
	return thumbnailMaxDimension
}

func derivativeDirectory(variant derivativeVariant) string {
	if variant == derivativePreview {
		return "previews"
	}
	return "thumbnails"
}

func derivativeFileName(id AssetID, cacheKey string) string {
	return string(id) + "-" + cacheKey + ".jpg"
}

func derivativePath(root string, id AssetID, variant derivativeVariant, cacheKey string) string {
	return internalPath(root, derivativeDirectory(variant), derivativeFileName(id, cacheKey))
}

// parseDerivativeFileName splits "<assetID>-<cacheKey>.jpg" back into its parts.
// Asset IDs are UUIDs, so they contain hyphens themselves: the separator is the
// LAST hyphen, and the cache key is always a fixed-length hex digest. Splitting
// on the first hyphen instead yields a truncated ID that never matches a
// recorded cache key, which made the orphan sweep delete every valid file.
// Legacy names without a cache key report found=false and stay sweepable.
func parseDerivativeFileName(name string) (AssetID, string, bool) {
	trimmed, ok := strings.CutSuffix(name, ".jpg")
	if !ok {
		return "", "", false
	}
	separator := strings.LastIndexByte(trimmed, '-')
	if separator <= 0 {
		return "", "", false
	}
	id, cacheKey := trimmed[:separator], trimmed[separator+1:]
	if len(cacheKey) != derivativeCacheKeyLength || !isHexString(cacheKey) {
		return "", "", false
	}
	return AssetID(id), cacheKey, true
}

func isHexString(value string) bool {
	for index := 0; index < len(value); index++ {
		c := value[index]
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') && (c < 'A' || c > 'F') {
			return false
		}
	}
	return true
}

func (m *Manager) queueThumbnail(session *librarySession, id AssetID) {
	if source, err := session.store.derivativeSource(session.ctx, id); err != nil || isRAWFormat(source.Format) || isRAWExtension(source.Extension) {
		return
	}
	_, _ = m.requestDerivative(session.ctx, session, id, derivativeThumbnail, derivativePriorityBackground, false)
}

// queueThumbnailCandidate skips the asset lookup when the caller already knows
// the format, which is the case for every asset the scan just indexed.
func (m *Manager) queueThumbnailCandidate(session *librarySession, candidate thumbnailCandidate) {
	if isRAWFormat(candidate.Format) || isRAWExtension(candidate.Extension) {
		return
	}
	_, _ = m.requestDerivative(session.ctx, session, candidate.ID, derivativeThumbnail, derivativePriorityBackground, false)
}

func (m *Manager) ensureThumbnail(session *librarySession, id AssetID) (string, error) {
	result, err := m.requestDerivative(session.ctx, session, id, derivativeThumbnail, derivativePrioritySelected, true)
	return result.status, err
}

func (m *Manager) requestDerivative(ctx context.Context, session *librarySession, id AssetID, variant derivativeVariant, priority derivativePriority, wait bool) (derivativeResult, error) {
	for attempt := 0; attempt < 2; attempt++ {
		source, err := session.store.derivativeSource(ctx, id)
		if err != nil {
			return derivativeResult{status: "unavailable", err: err}, err
		}
		result, retry := m.submitDerivative(ctx, session, id, source, variant, priority, wait)
		if !retry {
			return result, result.err
		}
	}
	return derivativeResult{status: "unavailable", err: errDerivativeSourceChanged}, errDerivativeSourceChanged
}

// submitDerivative queues one derivative for an already-loaded asset row. The
// initialization warm-up prefetches sources in bulk, which removes one indexed
// query per image from the hot path.
func (m *Manager) submitDerivative(ctx context.Context, session *librarySession, id AssetID, source derivativeSource, variant derivativeVariant, priority derivativePriority, wait bool) (derivativeResult, bool) {
	if source.Availability != "active" {
		err := newError(ErrAssetNotFound, "asset is not active", map[string]any{"assetId": id})
		return derivativeResult{status: "unavailable", err: err}, false
	}
	request := derivativeRequest{
		assetID:  id,
		variant:  variant,
		priority: priority,
		cacheKey: derivativeCacheKey(id, source.ModifiedAtNS, source.ByteSize, variant),
		source:   source,
	}
	result := session.derivatives.submit(ctx, request, wait)
	return result, wait && errors.Is(result.err, errDerivativeSourceChanged)
}

// warmDerivative generates a thumbnail from a prefetched asset row, falling back
// to a fresh lookup when the source turns out to have changed in the meantime.
func (m *Manager) warmDerivative(ctx context.Context, session *librarySession, id AssetID, source derivativeSource) {
	result, retry := m.submitDerivative(ctx, session, id, source, derivativeThumbnail, derivativePriorityBackground, true)
	if !retry {
		_ = result
		return
	}
	_, _ = m.requestDerivative(ctx, session, id, derivativeThumbnail, derivativePriorityBackground, true)
}

func (m *Manager) generateDerivative(ctx context.Context, session *librarySession, request derivativeRequest) (result derivativeResult) {
	result.status = "unavailable"
	defer func() {
		if recovered := recover(); recovered != nil {
			result.err = fmt.Errorf("derivative worker panic: %v", recovered)
			m.recordDerivativeFailure(session, request, result.err)
		}
	}()

	dimension := derivativeDimension(request.variant)
	destination := derivativePath(session.root, request.assetID, request.variant, request.cacheKey)
	writer := session.derivatives.writer

	// A row that is queued for the next batched commit is as good as committed:
	// without this check a grid request could regenerate a thumbnail that was
	// just produced by the initialization warm-up.
	if write, ok := writer.lookup(request.assetID, request.variant); ok && write.CacheKey == request.cacheKey && write.Status == "ready" {
		if info, statErr := os.Stat(destination); statErr == nil && info.Mode().IsRegular() && info.Size() > 0 {
			result.path, result.mime, result.status = destination, "image/jpeg", "ready"
			return result
		}
	}
	// Trust a committed ready row when the file on disk still matches its
	// recorded size. The previous implementation decoded the JPEG header of
	// every cached thumbnail before serving it.
	previousCacheKey := ""
	if record, recordErr := session.store.derivativeRecord(ctx, request.assetID, request.variant); recordErr == nil {
		if record.CacheKey != request.cacheKey {
			previousCacheKey = record.CacheKey
		}
		if record.CacheKey == request.cacheKey && record.Status == "ready" && record.Width > 0 && record.ByteSize > 0 {
			if info, statErr := os.Stat(destination); statErr == nil && info.Mode().IsRegular() && info.Size() == record.ByteSize {
				if request.variant == derivativePreview {
					// Only previews are trimmed by an LRU sweep, so only previews
					// need their access time refreshed.
					_ = session.store.touchDerivative(ctx, request.assetID, request.variant)
				}
				result.path, result.mime, result.status = destination, "image/jpeg", "ready"
				return result
			}
		}
	}

	var rawSlot chan struct{}
	if request.variant == derivativeThumbnail && (isRAWFormat(request.source.Format) || isRAWExtension(request.source.Extension)) && session.rawDerivativeSem != nil {
		rawSlot = session.rawDerivativeSem
		select {
		case rawSlot <- struct{}{}:
		case <-ctx.Done():
			result.err = ctx.Err()
			return result
		}
		defer func() { <-rawSlot }()
	}

	resolved, err := resolveWithinRoot(session.root, request.source.RelativePath)
	if err != nil {
		result.err = err
		m.recordDerivativeFailure(session, request, err)
		return result
	}
	// Validate the source before decoding instead of re-reading the asset row.
	// A mismatch means the queued request is stale, and the caller retries with
	// a fresh cache key.
	sourceInfo, statErr := os.Stat(resolved)
	if statErr != nil || sourceInfo.Size() != request.source.ByteSize || sourceInfo.ModTime().UnixNano() != request.source.ModifiedAtNS {
		result.err = errDerivativeSourceChanged
		return result
	}

	// An orphaned file from an interrupted run can be adopted without decoding
	// the source again.
	if adopted, ok := adoptDerivativeFile(destination, dimension, request.variant); ok {
		m.recordDerivativeSuccess(session, request, destination, previousCacheKey, adopted)
		result.path, result.mime, result.status = destination, "image/jpeg", "ready"
		return result
	}
	_ = os.Remove(destination)
	// Only interactive requests advertise a "generating" state. The background
	// warm-up would otherwise pay two extra write transactions and one event per
	// image just to describe work that finishes milliseconds later.
	if request.priority > derivativePriorityBackground {
		if err := session.store.setDerivativeResult(ctx, request.assetID, request.variant, request.cacheKey, dimension, 0, 0, 0, "generating", ""); err != nil {
			result.err = err
			return result
		}
		if request.variant == derivativeThumbnail {
			if err := session.store.setPreviewResult(ctx, request.assetID, "generating", ""); err != nil {
				result.err = err
				return result
			}
			m.emitPreviewStatus(session, request.assetID, "generating")
		}
	}
	rendered, err := derivativeRenderer(ctx, resolved, destination, dimension, request.source.Orientation)
	if err != nil {
		result.err = err
		m.recordDerivativeFailure(session, request, err)
		return result
	}
	info, err := os.Stat(resolved)
	if err != nil || info.Size() != request.source.ByteSize || info.ModTime().UnixNano() != request.source.ModifiedAtNS {
		_ = os.Remove(destination)
		result.err = errDerivativeSourceChanged
		return result
	}
	m.recordDerivativeSuccess(session, request, destination, previousCacheKey, rendered)
	if request.variant == derivativePreview {
		_ = m.trimPreviewCache(ctx, session, defaultPreviewCacheBytes)
	}
	result.path, result.mime, result.status = destination, "image/jpeg", "ready"
	return result
}

// recordDerivativeSuccess queues the bookkeeping for a generated derivative.
// Dominant colours come from the image that was just resized in memory; the old
// implementation spawned a goroutine that re-read and re-decoded the thumbnail
// from disk for every asset.
func (m *Manager) recordDerivativeSuccess(session *librarySession, request derivativeRequest, destination, previousCacheKey string, rendered derivativeRender) {
	write := derivativeWrite{
		AssetID:      request.assetID,
		Variant:      request.variant,
		CacheKey:     request.cacheKey,
		MaxDimension: derivativeDimension(request.variant),
		Width:        rendered.Width,
		Height:       rendered.Height,
		ByteSize:     rendered.ByteSize,
		Status:       "ready",
	}
	var preview *previewWrite
	if request.variant == derivativeThumbnail {
		preview = &previewWrite{ID: request.assetID, Status: "ready", Colors: rendered.Colors, SetColors: len(rendered.Colors) > 0}
	}
	interactive := request.priority > derivativePriorityBackground
	session.derivatives.writer.record(session.ctx, write, preview, interactive || !session.bulkThumbnails.Load())
	if interactive {
		// Interactive requests are observed immediately by the UI and by
		// maintenance APIs, so their bookkeeping is committed right away. Only
		// the bulk warm-up relies on the coalesced batch.
		session.derivatives.flushWrites(session.ctx)
	}
	// Remove only the file the record just superseded. Globbing the derivative
	// directory once per generated image turned a full warm-up into O(n^2)
	// directory scans.
	if previousCacheKey != "" && previousCacheKey != request.cacheKey {
		superseded := derivativePath(session.root, request.assetID, request.variant, previousCacheKey)
		if !sameFilePath(superseded, destination) {
			_ = os.Remove(superseded)
		}
	}
	_ = os.Remove(internalPath(session.root, derivativeDirectory(request.variant), string(request.assetID)+".jpg"))
}

// adoptDerivativeFile reuses a derivative file that already exists on disk but
// has no committed row, which happens after a crash or an interrupted warm-up.
func adoptDerivativeFile(path string, maxDimension int, variant derivativeVariant) (derivativeRender, bool) {
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
		return derivativeRender{}, false
	}
	if variant != derivativeThumbnail {
		config, configErr := decodeImageConfig(path)
		if configErr != nil || config.Width <= 0 || config.Height <= 0 || config.Width > maxDimension || config.Height > maxDimension {
			return derivativeRender{}, false
		}
		return derivativeRender{Width: config.Width, Height: config.Height, ByteSize: info.Size()}, true
	}
	// Thumbnails also carry the dominant colours, so the adopted file has to be
	// decoded once to avoid re-queueing the asset on every later scan.
	image, decodeErr := decodeImage(path)
	if decodeErr != nil {
		return derivativeRender{}, false
	}
	bounds := image.Bounds()
	if bounds.Dx() <= 0 || bounds.Dy() <= 0 || bounds.Dx() > maxDimension || bounds.Dy() > maxDimension {
		return derivativeRender{}, false
	}
	return derivativeRender{
		Width:    bounds.Dx(),
		Height:   bounds.Dy(),
		ByteSize: info.Size(),
		Colors:   extractDominantColors(image, 5),
	}, true
}

// sweepOrphanDerivativeFiles removes derivative files that no longer match the
// recorded cache keys. It runs once per scan as a single directory pass, which
// replaces the per-image glob the generator used to perform.
func (m *Manager) sweepOrphanDerivativeFiles(session *librarySession) {
	// Commit queued rows first so freshly generated files are represented in the
	// recorded cache keys. The sweep uses an uncancellable context: interrupting
	// a statement mid-flight can leave the database file briefly locked on
	// Windows, which breaks a library that is being closed at the same time.
	sweepCtx := context.WithoutCancel(session.ctx)
	if sessionClosed(session.done) || session.ctx.Err() != nil {
		return
	}
	session.derivatives.flushWrites(sweepCtx)
	// Files younger than this are left alone: an interactive request may have
	// written one after the cache keys were read.
	cutoff := time.Now().Add(-2 * time.Minute)
	for _, variant := range []derivativeVariant{derivativeThumbnail, derivativePreview} {
		if sessionClosed(session.done) || session.ctx.Err() != nil {
			return
		}
		current, err := session.store.derivatives.readyCacheKeys(sweepCtx, variant)
		if err != nil {
			return
		}
		directory := internalPath(session.root, derivativeDirectory(variant))
		entries, err := os.ReadDir(directory)
		if err != nil {
			continue
		}
		removed := 0
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".jpg") {
				continue
			}
			info, infoErr := entry.Info()
			if infoErr != nil || info.ModTime().After(cutoff) {
				continue
			}
			id, cacheKey, found := parseDerivativeFileName(entry.Name())
			if found {
				if expected, ok := current[id]; ok && expected == cacheKey {
					continue
				}
			}
			if os.Remove(filepath.Join(directory, entry.Name())) == nil {
				removed++
			}
		}
		if removed > 0 {
			log.Printf("[local-library] swept orphan %s files root=%s removed=%d", variant, session.root, removed)
		}
	}
}

func (m *Manager) recordDerivativeFailure(session *librarySession, request derivativeRequest, cause error) {
	message := ""
	if cause != nil {
		message = cause.Error()
	}
	_ = session.store.setDerivativeResult(context.Background(), request.assetID, request.variant, request.cacheKey, derivativeDimension(request.variant), 0, 0, 0, "unavailable", message)
	if request.variant == derivativeThumbnail {
		_ = session.store.setPreviewResult(context.Background(), request.assetID, "unavailable", message)
		m.emitPreviewStatus(session, request.assetID, "unavailable")
	}
}

func removeStaleDerivativeFiles(root string, id AssetID, variant derivativeVariant, keep string) {
	directory := internalPath(root, derivativeDirectory(variant))
	matches, _ := filepath.Glob(filepath.Join(directory, string(id)+"-*.jpg"))
	legacy := internalPath(root, derivativeDirectory(variant), string(id)+".jpg")
	matches = append(matches, legacy)
	for _, path := range matches {
		if keep == "" || !sameFilePath(path, keep) {
			_ = os.Remove(path)
		}
	}
}

func sameFilePath(left, right string) bool {
	return strings.EqualFold(filepath.Clean(left), filepath.Clean(right))
}

func removeAssetDerivativeFiles(root string, id AssetID) {
	for _, variant := range []derivativeVariant{derivativeThumbnail, derivativePreview} {
		removeStaleDerivativeFiles(root, id, variant, "")
	}
}

// forgetAssetDerivatives removes both the cached files and the cache rows of a
// deleted asset. The rows live in derivatives.db, so they are no longer removed
// by an ON DELETE CASCADE from assets.
func (session *librarySession) forgetAssetDerivatives(ids ...AssetID) {
	for _, id := range ids {
		removeAssetDerivativeFiles(session.root, id)
	}
	if session.store != nil && session.store.derivatives != nil {
		_ = session.store.derivatives.deleteAssets(context.Background(), ids)
	}
}

func (m *Manager) trimPreviewCache(ctx context.Context, session *librarySession, maxBytes int64) error {
	if maxBytes < 0 {
		maxBytes = 0
	}
	entries, err := session.store.previewDerivativeEntries(ctx)
	if err != nil {
		return err
	}
	var total int64
	for _, entry := range entries {
		total += entry.ByteSize
	}
	for _, entry := range entries {
		if total <= maxBytes {
			break
		}
		path := derivativePath(session.root, entry.AssetID, derivativePreview, entry.CacheKey)
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err := session.store.deleteDerivative(ctx, entry.AssetID, derivativePreview, entry.CacheKey); err != nil {
			continue
		}
		total -= entry.ByteSize
	}
	return nil
}

func derivativeCacheUsage(directory string) (CacheUsage, error) {
	var usage CacheUsage
	err := filepath.WalkDir(directory, func(_ string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			if errors.Is(walkErr, os.ErrNotExist) {
				return nil
			}
			return walkErr
		}
		if entry.IsDir() || !entry.Type().IsRegular() {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		usage.FileCount++
		usage.Bytes += info.Size()
		return nil
	})
	if errors.Is(err, os.ErrNotExist) {
		return CacheUsage{}, nil
	}
	return usage, err
}

func (m *Manager) CacheStats() (LocalLibraryCacheStats, error) {
	session, err := m.requireAvailableSession()
	if err != nil {
		return LocalLibraryCacheStats{}, err
	}
	internal, err := derivativeCacheUsage(internalPath(session.root))
	if err != nil {
		return LocalLibraryCacheStats{}, err
	}
	thumbnails, err := derivativeCacheUsage(internalPath(session.root, derivativeDirectory(derivativeThumbnail)))
	if err != nil {
		return LocalLibraryCacheStats{}, err
	}
	previews, err := derivativeCacheUsage(internalPath(session.root, derivativeDirectory(derivativePreview)))
	if err != nil {
		return LocalLibraryCacheStats{}, err
	}
	libraryData := CacheUsage{
		FileCount: internal.FileCount - thumbnails.FileCount - previews.FileCount,
		Bytes:     internal.Bytes - thumbnails.Bytes - previews.Bytes,
	}
	if libraryData.FileCount < 0 {
		libraryData.FileCount = 0
	}
	if libraryData.Bytes < 0 {
		libraryData.Bytes = 0
	}
	return LocalLibraryCacheStats{
		Internal:          internal,
		LibraryData:       libraryData,
		Thumbnails:        thumbnails,
		Previews:          previews,
		TotalBytes:        internal.Bytes,
		PreviewLimitBytes: defaultPreviewCacheBytes,
	}, nil
}

// ClearPreviewCache removes only regenerable 2048px previews. Grid thumbnails are retained.
func (m *Manager) ClearPreviewCache() error {
	session, err := m.requireAvailableSession()
	if err != nil {
		return err
	}
	return m.trimPreviewCache(session.ctx, session, 0)
}

func orientedImage(source image.Image, orientation int) image.Image {
	if orientation < 2 || orientation > 8 {
		return source
	}
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	outputWidth, outputHeight := width, height
	if orientation >= 5 {
		outputWidth, outputHeight = height, width
	}
	target := image.NewNRGBA(image.Rect(0, 0, outputWidth, outputHeight))
	for y := 0; y < outputHeight; y++ {
		for x := 0; x < outputWidth; x++ {
			sx, sy := x, y
			switch orientation {
			case 2:
				sx = width - 1 - x
			case 3:
				sx, sy = width-1-x, height-1-y
			case 4:
				sy = height - 1 - y
			case 5:
				sx, sy = y, x
			case 6:
				sx, sy = y, height-1-x
			case 7:
				sx, sy = width-1-y, height-1-x
			case 8:
				sx, sy = width-1-y, x
			}
			target.Set(x, y, source.At(bounds.Min.X+sx, bounds.Min.Y+sy))
		}
	}
	return target
}
