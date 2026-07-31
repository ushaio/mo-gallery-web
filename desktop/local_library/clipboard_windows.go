//go:build windows

package local_library

import (
	"encoding/binary"
	"fmt"
	"strings"
	"unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	cfHDrop          = 15
	gmemMoveable     = 0x0002
	dropEffectCopy   = 1
	dropEffectMove   = 2
	dropFilesHdrSize = 20
)

var (
	user32Clipboard              = windows.NewLazySystemDLL("user32.dll")
	kernel32Clipboard            = windows.NewLazySystemDLL("kernel32.dll")
	procOpenClipboard            = user32Clipboard.NewProc("OpenClipboard")
	procCloseClipboard           = user32Clipboard.NewProc("CloseClipboard")
	procEmptyClipboard           = user32Clipboard.NewProc("EmptyClipboard")
	procSetClipboardData         = user32Clipboard.NewProc("SetClipboardData")
	procRegisterClipboardFormatW = user32Clipboard.NewProc("RegisterClipboardFormatW")
	procGlobalAlloc              = kernel32Clipboard.NewProc("GlobalAlloc")
	procGlobalLock               = kernel32Clipboard.NewProc("GlobalLock")
	procGlobalUnlock             = kernel32Clipboard.NewProc("GlobalUnlock")
	procGlobalFree               = kernel32Clipboard.NewProc("GlobalFree")
)

func setFileClipboard(paths []string, cut bool) error {
	if len(paths) == 0 {
		return fmt.Errorf("没有可复制的文件")
	}
	pathList := strings.Join(paths, "\x00") + "\x00\x00"
	utf16Paths := utf16.Encode([]rune(pathList))
	payload := make([]byte, dropFilesHdrSize+len(utf16Paths)*2)
	binary.LittleEndian.PutUint32(payload[0:4], dropFilesHdrSize)
	binary.LittleEndian.PutUint32(payload[16:20], 1) // DROPFILES.fWide
	for index, value := range utf16Paths {
		binary.LittleEndian.PutUint16(payload[dropFilesHdrSize+index*2:], value)
	}

	opened, _, openErr := procOpenClipboard.Call(0)
	if opened == 0 {
		return fmt.Errorf("无法打开系统剪贴板: %w", openErr)
	}
	defer procCloseClipboard.Call()
	if emptied, _, emptyErr := procEmptyClipboard.Call(); emptied == 0 {
		return fmt.Errorf("无法清空系统剪贴板: %w", emptyErr)
	}
	if err := setClipboardMemory(cfHDrop, payload); err != nil {
		return err
	}

	formatName, _ := windows.UTF16PtrFromString("Preferred DropEffect")
	format, _, formatErr := procRegisterClipboardFormatW.Call(uintptr(unsafe.Pointer(formatName)))
	if format == 0 {
		return fmt.Errorf("无法注册文件剪贴板操作类型: %w", formatErr)
	}
	effect := uint32(dropEffectCopy)
	if cut {
		effect = dropEffectMove
	}
	effectBytes := make([]byte, 4)
	binary.LittleEndian.PutUint32(effectBytes, effect)
	return setClipboardMemory(uint32(format), effectBytes)
}

func setClipboardMemory(format uint32, payload []byte) error {
	handle, _, allocErr := procGlobalAlloc.Call(gmemMoveable, uintptr(len(payload)))
	if handle == 0 {
		return fmt.Errorf("无法分配剪贴板内存: %w", allocErr)
	}
	owned := true
	defer func() {
		if owned {
			procGlobalFree.Call(handle)
		}
	}()

	pointer, _, lockErr := procGlobalLock.Call(handle)
	if pointer == 0 {
		return fmt.Errorf("无法写入剪贴板内存: %w", lockErr)
	}
	copy(unsafe.Slice((*byte)(unsafe.Pointer(pointer)), len(payload)), payload)
	procGlobalUnlock.Call(handle)

	stored, _, storeErr := procSetClipboardData.Call(uintptr(format), handle)
	if stored == 0 {
		return fmt.Errorf("无法设置系统剪贴板: %w", storeErr)
	}
	owned = false
	return nil
}
