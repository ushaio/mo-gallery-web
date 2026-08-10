//go:build windows

package agent_extensions

import (
	"errors"
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	credTypeGeneric         = 1
	credPersistLocalMachine = 2
)

type windowsCredentialStore struct{}

type nativeCredential struct {
	Flags              uint32
	Type               uint32
	TargetName         *uint16
	Comment            *uint16
	LastWritten        windows.Filetime
	CredentialBlobSize uint32
	CredentialBlob     *byte
	Persist            uint32
	AttributeCount     uint32
	Attributes         uintptr
	TargetAlias        *uint16
	UserName           *uint16
}

var (
	advapi32       = windows.NewLazySystemDLL("advapi32.dll")
	procCredWrite  = advapi32.NewProc("CredWriteW")
	procCredRead   = advapi32.NewProc("CredReadW")
	procCredDelete = advapi32.NewProc("CredDeleteW")
	procCredFree   = advapi32.NewProc("CredFree")
)

func NewCredentialStore() CredentialStore { return windowsCredentialStore{} }

func (windowsCredentialStore) Set(reference, value string) error {
	target, err := windows.UTF16PtrFromString(reference)
	if err != nil {
		return err
	}
	username, err := windows.UTF16PtrFromString("MO Gallery Desktop")
	if err != nil {
		return err
	}
	blob := []byte(value)
	credential := nativeCredential{
		Type:               credTypeGeneric,
		TargetName:         target,
		CredentialBlobSize: uint32(len(blob)),
		Persist:            credPersistLocalMachine,
		UserName:           username,
	}
	if len(blob) > 0 {
		credential.CredentialBlob = &blob[0]
	}
	result, _, callErr := procCredWrite.Call(uintptr(unsafe.Pointer(&credential)), 0)
	if result == 0 {
		return fmt.Errorf("CredWriteW failed: %w", callErr)
	}
	return nil
}

func (windowsCredentialStore) Get(reference string) (string, error) {
	target, err := windows.UTF16PtrFromString(reference)
	if err != nil {
		return "", err
	}
	var pointer *nativeCredential
	result, _, callErr := procCredRead.Call(
		uintptr(unsafe.Pointer(target)),
		credTypeGeneric,
		0,
		uintptr(unsafe.Pointer(&pointer)),
	)
	if result == 0 {
		if errors.Is(callErr, windows.ERROR_NOT_FOUND) {
			return "", errors.New("credential not found")
		}
		return "", fmt.Errorf("CredReadW failed: %w", callErr)
	}
	defer procCredFree.Call(uintptr(unsafe.Pointer(pointer)))
	if pointer == nil || pointer.CredentialBlobSize == 0 || pointer.CredentialBlob == nil {
		return "", nil
	}
	blob := unsafe.Slice(pointer.CredentialBlob, int(pointer.CredentialBlobSize))
	return string(append([]byte(nil), blob...)), nil
}

func (windowsCredentialStore) Delete(reference string) error {
	target, err := windows.UTF16PtrFromString(reference)
	if err != nil {
		return err
	}
	result, _, callErr := procCredDelete.Call(uintptr(unsafe.Pointer(target)), credTypeGeneric, 0)
	if result == 0 && !errors.Is(callErr, windows.ERROR_NOT_FOUND) {
		return fmt.Errorf("CredDeleteW failed: %w", callErr)
	}
	return nil
}
