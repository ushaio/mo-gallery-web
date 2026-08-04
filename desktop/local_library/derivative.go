package local_library

import (
	"container/heap"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"os"
	"path/filepath"
	"strings"
	"sync"
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
}

func newDerivativeScheduler(session *librarySession, workers int, run func(context.Context, derivativeRequest) derivativeResult) *derivativeScheduler {
	if workers < 1 {
		workers = 1
	}
	scheduler := &derivativeScheduler{
		ctx:     session.ctx,
		run:     run,
		flights: make(map[string]*derivativeFlight),
		wake:    make(chan struct{}, 1),
		stop:    make(chan struct{}),
	}
	heap.Init(&scheduler.queue)
	for range workers {
		session.startWorker(scheduler.worker)
	}
	return scheduler
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

func (m *Manager) queueThumbnail(session *librarySession, id AssetID) {
	_, _ = m.requestDerivative(session.ctx, session, id, derivativeThumbnail, derivativePriorityBackground, false)
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
		if source.Availability != "active" {
			err = newError(ErrAssetNotFound, "asset is not active", map[string]any{"assetId": id})
			return derivativeResult{status: "unavailable", err: err}, err
		}
		request := derivativeRequest{
			assetID:  id,
			variant:  variant,
			priority: priority,
			cacheKey: derivativeCacheKey(id, source.ModifiedAtNS, source.ByteSize, variant),
			source:   source,
		}
		result := session.derivatives.submit(ctx, request, wait)
		if !errors.Is(result.err, errDerivativeSourceChanged) || !wait {
			return result, result.err
		}
	}
	return derivativeResult{status: "unavailable", err: errDerivativeSourceChanged}, errDerivativeSourceChanged
}

func (m *Manager) generateDerivative(ctx context.Context, session *librarySession, request derivativeRequest) (result derivativeResult) {
	result.status = "unavailable"
	defer func() {
		if recovered := recover(); recovered != nil {
			result.err = fmt.Errorf("derivative worker panic: %v", recovered)
			m.recordDerivativeFailure(session, request, result.err)
		}
	}()

	current, err := session.store.derivativeSource(ctx, request.assetID)
	if err != nil {
		result.err = err
		return result
	}
	currentKey := derivativeCacheKey(request.assetID, current.ModifiedAtNS, current.ByteSize, request.variant)
	if currentKey != request.cacheKey || current.Availability != "active" {
		result.err = errDerivativeSourceChanged
		return result
	}
	destination := derivativePath(session.root, request.assetID, request.variant, request.cacheKey)
	if record, recordErr := session.store.derivativeRecord(ctx, request.assetID, request.variant); recordErr == nil && record.CacheKey == request.cacheKey && record.Status == "ready" {
		if validDerivativeFile(destination, derivativeDimension(request.variant)) {
			_ = session.store.touchDerivative(ctx, request.assetID, request.variant)
			if request.variant == derivativeThumbnail {
				if thumbnail, colorErr := decodeImage(destination); colorErr == nil {
					_ = session.store.setDominantColors(ctx, request.assetID, extractDominantColors(thumbnail, 5))
				}
			}
			result.path, result.mime, result.status = destination, "image/jpeg", "ready"
			return result
		}
	}
	if validDerivativeFile(destination, derivativeDimension(request.variant)) {
		info, _ := os.Stat(destination)
		config, _ := decodeImageConfig(destination)
		_ = session.store.setDerivativeResult(ctx, request.assetID, request.variant, request.cacheKey, derivativeDimension(request.variant), config.Width, config.Height, info.Size(), "ready", "")
		if request.variant == derivativeThumbnail {
			if thumbnail, colorErr := decodeImage(destination); colorErr == nil {
				_ = session.store.setDominantColors(ctx, request.assetID, extractDominantColors(thumbnail, 5))
			}
			_ = session.store.setPreviewResult(ctx, request.assetID, "ready", "")
			m.emitPreviewStatus(session, request.assetID, "ready")
		}
		result.path, result.mime, result.status = destination, "image/jpeg", "ready"
		return result
	}
	_ = os.Remove(destination)
	if err := session.store.setDerivativeResult(ctx, request.assetID, request.variant, request.cacheKey, derivativeDimension(request.variant), 0, 0, 0, "generating", ""); err != nil {
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
	resolved, err := resolveWithinRoot(session.root, request.source.RelativePath)
	if err != nil {
		result.err = err
		m.recordDerivativeFailure(session, request, err)
		return result
	}
	if err := derivativeRenderer(ctx, resolved, destination, derivativeDimension(request.variant), request.source.Orientation); err != nil {
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
	generated, err := os.Stat(destination)
	if err != nil {
		result.err = err
		m.recordDerivativeFailure(session, request, err)
		return result
	}
	config, err := decodeImageConfig(destination)
	if err != nil {
		result.err = err
		m.recordDerivativeFailure(session, request, err)
		return result
	}
	if request.variant == derivativeThumbnail {
		if thumbnail, colorErr := decodeImage(destination); colorErr == nil {
			_ = session.store.setDominantColors(ctx, request.assetID, extractDominantColors(thumbnail, 5))
		}
	}
	if err := session.store.setDerivativeResult(ctx, request.assetID, request.variant, request.cacheKey, derivativeDimension(request.variant), config.Width, config.Height, generated.Size(), "ready", ""); err != nil {
		result.err = err
		return result
	}
	removeStaleDerivativeFiles(session.root, request.assetID, request.variant, destination)
	if request.variant == derivativeThumbnail {
		if err := session.store.setPreviewResult(ctx, request.assetID, "ready", ""); err != nil {
			result.err = err
			return result
		}
		m.emitPreviewStatus(session, request.assetID, "ready")
	} else {
		_ = m.trimPreviewCache(ctx, session, defaultPreviewCacheBytes)
	}
	result.path, result.mime, result.status = destination, "image/jpeg", "ready"
	return result
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

func validDerivativeFile(path string, maxDimension int) bool {
	config, err := decodeImageConfig(path)
	return err == nil && config.Width > 0 && config.Height > 0 && config.Width <= maxDimension && config.Height <= maxDimension
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
