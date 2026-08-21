package storage_plugins

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	transferChunkSize = 256 * 1024
	maxRPCLineBytes   = 4 * 1024 * 1024
	maxTransferBytes  = int64(8 * 1024 * 1024 * 1024)
	maxPluginStderr   = 8 * 1024
)

type pluginStderrCapture struct {
	mu   sync.Mutex
	data []byte
}

func (capture *pluginStderrCapture) Write(data []byte) (int, error) {
	capture.mu.Lock()
	defer capture.mu.Unlock()
	if len(capture.data) < maxPluginStderr {
		remaining := maxPluginStderr - len(capture.data)
		if len(data) > remaining {
			data = data[:remaining]
		}
		capture.data = append(capture.data, data...)
	}
	return len(data), nil
}

func (capture *pluginStderrCapture) String() string {
	capture.mu.Lock()
	defer capture.mu.Unlock()
	return strings.TrimSpace(string(capture.data))
}

type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int64  `json:"id,omitempty"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int64           `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type transfer struct {
	file        *os.File
	size        int64
	writable    bool
	written     int64
	destination string
	temporary   string
}

type pluginRuntime struct {
	mu           sync.Mutex
	writeMu      sync.Mutex
	command      *exec.Cmd
	stdin        io.WriteCloser
	responses    map[int64]chan rpcResponse
	transfers    map[string]transfer
	nextID       atomic.Int64
	closed       chan struct{}
	exited       chan struct{}
	closeOnce    sync.Once
	capabilities map[string]struct{}
}

func startPluginRuntime(command string, args, environment []string) (*pluginRuntime, error) {
	if strings.TrimSpace(command) == "" {
		return nil, errors.New("storage plugin command is required")
	}
	process := exec.Command(command, args...)
	process.Env = append(os.Environ(), environment...)
	stdin, err := process.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("open plugin stdin: %w", err)
	}
	stdout, err := process.StdoutPipe()
	if err != nil {
		_ = stdin.Close()
		return nil, fmt.Errorf("open plugin stdout: %w", err)
	}
	stderr, err := process.StderrPipe()
	if err != nil {
		_ = stdin.Close()
		_ = stdout.Close()
		return nil, fmt.Errorf("open plugin stderr: %w", err)
	}
	if err := process.Start(); err != nil {
		_ = stdin.Close()
		_ = stdout.Close()
		_ = stderr.Close()
		return nil, fmt.Errorf("start storage plugin: %w", err)
	}
	runtime := &pluginRuntime{
		command:   process,
		stdin:     stdin,
		responses: make(map[int64]chan rpcResponse),
		transfers: make(map[string]transfer),
		closed:    make(chan struct{}),
		exited:    make(chan struct{}),
	}
	stderrCapture := &pluginStderrCapture{}
	stderrDone := make(chan struct{})
	go runtime.readLoop(stdout)
	go func() {
		_, _ = io.Copy(stderrCapture, stderr)
		close(stderrDone)
	}()
	go func() {
		defer close(runtime.exited)
		waitErr := process.Wait()
		<-stderrDone
		if waitErr != nil {
			if detail := stderrCapture.String(); detail != "" {
				waitErr = fmt.Errorf("%w: %s", waitErr, detail)
			}
			runtime.failPending(&PluginError{Code: ErrorPluginCrashed, Message: "storage plugin exited", Cause: waitErr})
		} else {
			runtime.failPending(errors.New("storage plugin exited"))
		}
		runtime.cleanupTransfers()
		runtime.closeOnce.Do(func() { close(runtime.closed) })
	}()
	return runtime, nil
}

func (r *pluginRuntime) supports(capability string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	_, ok := r.capabilities[capability]
	return ok
}

func (r *pluginRuntime) readLoop(reader io.Reader) {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64*1024), maxRPCLineBytes)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var envelope struct {
			ID     int64           `json:"id"`
			Method string          `json:"method"`
			Params json.RawMessage `json:"params"`
			Result json.RawMessage `json:"result"`
			Error  *rpcError       `json:"error"`
		}
		if err := json.Unmarshal([]byte(line), &envelope); err != nil {
			continue
		}
		if envelope.Method != "" {
			go r.handleHostRequest(rpcRequest{JSONRPC: "2.0", ID: envelope.ID, Method: envelope.Method, Params: envelope.Params})
			continue
		}
		response := rpcResponse{JSONRPC: "2.0", ID: envelope.ID, Result: envelope.Result, Error: envelope.Error}
		r.mu.Lock()
		channel := r.responses[response.ID]
		delete(r.responses, response.ID)
		r.mu.Unlock()
		if channel != nil {
			channel <- response
			close(channel)
		}
	}
	if err := scanner.Err(); err != nil {
		r.failPending(err)
	}
}

func (r *pluginRuntime) handleHostRequest(request rpcRequest) {
	switch request.Method {
	case "host.transfer.read":
		r.handleTransferRead(request)
	case "host.transfer.write":
		r.handleTransferWrite(request)
	default:
		_ = r.writeResponse(rpcResponse{JSONRPC: "2.0", ID: request.ID, Error: &rpcError{Code: -32601, Message: "method not found"}})
	}
}

func (r *pluginRuntime) handleTransferRead(request rpcRequest) {
	var params struct {
		TransferID string `json:"transferId"`
		Offset     int64  `json:"offset"`
		Length     int    `json:"length"`
	}
	if raw, ok := request.Params.(json.RawMessage); ok {
		_ = json.Unmarshal(raw, &params)
	}
	if params.Length <= 0 || params.Length > transferChunkSize {
		params.Length = transferChunkSize
	}
	r.mu.Lock()
	item, ok := r.transfers[params.TransferID]
	r.mu.Unlock()
	if !ok || item.writable {
		_ = r.writeResponse(rpcResponse{JSONRPC: "2.0", ID: request.ID, Error: &rpcError{Code: -32004, Message: "transfer not found"}})
		return
	}
	if params.Offset < 0 || params.Offset > item.size {
		_ = r.writeResponse(rpcResponse{JSONRPC: "2.0", ID: request.ID, Error: &rpcError{Code: -32602, Message: "invalid transfer offset"}})
		return
	}
	buffer := make([]byte, params.Length)
	read, err := item.file.ReadAt(buffer, params.Offset)
	if err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, io.ErrUnexpectedEOF) {
		_ = r.writeResponse(rpcResponse{JSONRPC: "2.0", ID: request.ID, Error: &rpcError{Code: -32005, Message: err.Error()}})
		return
	}
	buffer = buffer[:read]
	result := map[string]any{
		"data":   base64.StdEncoding.EncodeToString(buffer),
		"offset": params.Offset,
		"next":   params.Offset + int64(read),
		"eof":    params.Offset+int64(read) >= item.size,
	}
	_ = r.writeResponse(rpcResponse{JSONRPC: "2.0", ID: request.ID, Result: mustJSON(result)})
}

func (r *pluginRuntime) handleTransferWrite(request rpcRequest) {
	var params struct {
		TransferID string `json:"transferId"`
		Offset     int64  `json:"offset"`
		Data       string `json:"data"`
	}
	if raw, ok := request.Params.(json.RawMessage); ok {
		_ = json.Unmarshal(raw, &params)
	}
	if params.Offset < 0 || params.Offset > maxTransferBytes || len(params.Data) > transferChunkSize*2 {
		_ = r.writeResponse(rpcResponse{JSONRPC: "2.0", ID: request.ID, Error: &rpcError{Code: -32602, Message: "invalid transfer write"}})
		return
	}
	data, err := base64.StdEncoding.DecodeString(params.Data)
	if err != nil || len(data) > transferChunkSize {
		_ = r.writeResponse(rpcResponse{JSONRPC: "2.0", ID: request.ID, Error: &rpcError{Code: -32602, Message: "invalid transfer data"}})
		return
	}
	r.mu.Lock()
	item, ok := r.transfers[params.TransferID]
	if !ok || !item.writable {
		r.mu.Unlock()
		_ = r.writeResponse(rpcResponse{JSONRPC: "2.0", ID: request.ID, Error: &rpcError{Code: -32004, Message: "transfer not found"}})
		return
	}
	if params.Offset != item.written {
		r.mu.Unlock()
		_ = r.writeResponse(rpcResponse{JSONRPC: "2.0", ID: request.ID, Error: &rpcError{Code: -32602, Message: "transfer writes must be sequential"}})
		return
	}
	if item.written > maxTransferBytes-int64(len(data)) {
		r.mu.Unlock()
		_ = r.writeResponse(rpcResponse{JSONRPC: "2.0", ID: request.ID, Error: &rpcError{Code: -32005, Message: "transfer exceeds the size limit"}})
		return
	}
	written, writeErr := item.file.WriteAt(data, params.Offset)
	if writeErr == nil && written != len(data) {
		writeErr = io.ErrShortWrite
	}
	if writeErr == nil {
		item.written += int64(written)
		r.transfers[params.TransferID] = item
	}
	next := item.written
	r.mu.Unlock()
	if writeErr != nil {
		_ = r.writeResponse(rpcResponse{JSONRPC: "2.0", ID: request.ID, Error: &rpcError{Code: -32005, Message: "write transfer failed"}})
		return
	}
	_ = r.writeResponse(rpcResponse{JSONRPC: "2.0", ID: request.ID, Result: mustJSON(map[string]any{"offset": params.Offset, "next": next, "size": next})})
}

func (r *pluginRuntime) writeResponse(response rpcResponse) error {
	return r.write(rpcRequest{JSONRPC: response.JSONRPC, ID: response.ID, Params: response.Result, Method: ""}, response.Error)
}

func (r *pluginRuntime) write(request rpcRequest, rpcErr *rpcError) error {
	var payload struct {
		JSONRPC string          `json:"jsonrpc"`
		ID      int64           `json:"id,omitempty"`
		Result  json.RawMessage `json:"result,omitempty"`
		Error   *rpcError       `json:"error,omitempty"`
		Method  string          `json:"method,omitempty"`
		Params  any             `json:"params,omitempty"`
	}
	payload.JSONRPC = "2.0"
	payload.ID = request.ID
	payload.Method = request.Method
	payload.Params = request.Params
	payload.Error = rpcErr
	if request.Method == "" && rpcErr == nil {
		if result, ok := request.Params.(json.RawMessage); ok {
			payload.Result = result
		}
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	r.writeMu.Lock()
	defer r.writeMu.Unlock()
	_, err = r.stdin.Write(append(data, '\n'))
	return err
}

func (r *pluginRuntime) request(ctx context.Context, method string, params any, result any) error {
	id := r.nextID.Add(1)
	channel := make(chan rpcResponse, 1)
	r.mu.Lock()
	if r.stdin == nil {
		r.mu.Unlock()
		return errors.New("storage plugin is not running")
	}
	r.responses[id] = channel
	r.mu.Unlock()
	data, err := json.Marshal(rpcRequest{JSONRPC: "2.0", ID: id, Method: method, Params: params})
	if err != nil {
		r.removePending(id)
		return err
	}
	r.writeMu.Lock()
	_, err = r.stdin.Write(append(data, '\n'))
	r.writeMu.Unlock()
	if err != nil {
		r.removePending(id)
		return err
	}
	select {
	case response := <-channel:
		if response.Error != nil {
			return fmt.Errorf("storage plugin %s failed (%v): %s", method, response.Error.Code, response.Error.Message)
		}
		if result == nil || len(response.Result) == 0 {
			return nil
		}
		if err := json.Unmarshal(response.Result, result); err != nil {
			return fmt.Errorf("decode storage plugin %s response: %w", method, err)
		}
		return nil
	case <-ctx.Done():
		r.removePending(id)
		return ctx.Err()
	case <-r.closed:
		r.removePending(id)
		return errors.New("storage plugin exited")
	}
}

func (r *pluginRuntime) removePending(id int64) {
	r.mu.Lock()
	delete(r.responses, id)
	r.mu.Unlock()
}

func (r *pluginRuntime) failPending(err error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for id, channel := range r.responses {
		channel <- rpcResponse{ID: id, Error: &rpcError{Code: -32000, Message: err.Error()}}
		close(channel)
		delete(r.responses, id)
	}
}

// cleanupTransfers closes all host-owned transfer files after a plugin exits.
// In particular, interrupted downloads must not leave a temporary file next
// to the caller's destination. The process exit path calls this independently
// of stop(), because a crashed child is not present in the manager registry
// anymore and therefore cannot rely on normal source cleanup.
func (r *pluginRuntime) cleanupTransfers() {
	r.mu.Lock()
	transfers := make([]transfer, 0, len(r.transfers))
	for id, item := range r.transfers {
		transfers = append(transfers, item)
		delete(r.transfers, id)
	}
	r.mu.Unlock()
	for _, item := range transfers {
		_ = item.file.Close()
		if item.writable && item.temporary != "" {
			_ = os.Remove(item.temporary)
		}
	}
}

func (r *pluginRuntime) registerTransfer(filePath string) (TransferHandle, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return TransferHandle{}, err
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return TransferHandle{}, err
	}
	id, err := randomTransferID()
	if err != nil {
		_ = file.Close()
		return TransferHandle{}, err
	}
	r.mu.Lock()
	r.transfers[id] = transfer{file: file, size: info.Size()}
	r.mu.Unlock()
	return TransferHandle{ID: id, Size: info.Size()}, nil
}

func (r *pluginRuntime) registerDownloadTransfer(filePath string) (TransferHandle, error) {
	filePath = strings.TrimSpace(filePath)
	if filePath == "" {
		return TransferHandle{}, errors.New("download destination path is required")
	}
	destination, err := filepath.Abs(filePath)
	if err != nil {
		return TransferHandle{}, fmt.Errorf("resolve download destination: %w", err)
	}
	if info, statErr := os.Lstat(destination); statErr == nil {
		if info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return TransferHandle{}, errors.New("download destination must be a regular file")
		}
	} else if !errors.Is(statErr, os.ErrNotExist) {
		return TransferHandle{}, fmt.Errorf("inspect download destination: %w", statErr)
	}
	id, err := randomTransferID()
	if err != nil {
		return TransferHandle{}, err
	}
	temporary := destination + ".mo-gallery-transfer-" + id
	file, err := os.OpenFile(temporary, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return TransferHandle{}, fmt.Errorf("create download transfer: %w", err)
	}
	r.mu.Lock()
	r.transfers[id] = transfer{file: file, writable: true, destination: destination, temporary: temporary}
	r.mu.Unlock()
	return TransferHandle{ID: id, Size: 0}, nil
}

func (r *pluginRuntime) unregisterTransfer(id string) {
	r.mu.Lock()
	item, ok := r.transfers[id]
	delete(r.transfers, id)
	r.mu.Unlock()
	if ok {
		_ = item.file.Close()
		if item.writable && item.temporary != "" {
			_ = os.Remove(item.temporary)
		}
	}
}

func (r *pluginRuntime) transferWritten(id string) (int64, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	item, ok := r.transfers[id]
	if !ok || !item.writable {
		return 0, false
	}
	return item.written, true
}

func (r *pluginRuntime) commitDownloadTransfer(id string) (int64, error) {
	r.mu.Lock()
	item, ok := r.transfers[id]
	if ok {
		delete(r.transfers, id)
	}
	r.mu.Unlock()
	if !ok || !item.writable {
		return 0, errors.New("download transfer not found")
	}
	if err := item.file.Close(); err != nil {
		_ = os.Remove(item.temporary)
		return 0, fmt.Errorf("close download transfer: %w", err)
	}
	err := os.Rename(item.temporary, item.destination)
	if err != nil && runtime.GOOS == "windows" {
		if info, statErr := os.Lstat(item.destination); statErr == nil && info.Mode().IsRegular() {
			if removeErr := os.Remove(item.destination); removeErr == nil {
				err = os.Rename(item.temporary, item.destination)
			}
		}
	}
	if err != nil {
		_ = os.Remove(item.temporary)
		return 0, fmt.Errorf("commit downloaded object: %w", err)
	}
	return item.written, nil
}

func (r *pluginRuntime) stop() error {
	r.closeOnce.Do(func() { close(r.closed) })
	r.cleanupTransfers()
	r.mu.Lock()
	stdin := r.stdin
	command := r.command
	r.stdin = nil
	r.mu.Unlock()
	if stdin != nil {
		_ = stdin.Close()
	}
	if command != nil && command.Process != nil {
		_ = command.Process.Kill()
		if r.exited != nil {
			select {
			case <-r.exited:
			case <-time.After(5 * time.Second):
			}
		}
	}
	return nil
}

func randomTransferID() (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return fmt.Sprintf("transfer-%x", buffer), nil
}

func mustJSON(value any) json.RawMessage {
	data, _ := json.Marshal(value)
	return data
}

func withTimeout(parent context.Context) (context.Context, context.CancelFunc) {
	if _, ok := parent.Deadline(); ok {
		return parent, func() {}
	}
	return context.WithTimeout(parent, 10*time.Minute)
}
