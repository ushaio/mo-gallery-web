//go:build windows

package local_library

import "golang.org/x/sys/windows"

func renameFileNoReplace(source, destination string) error {
	sourceUTF16, err := windows.UTF16PtrFromString(source)
	if err != nil {
		return err
	}
	destinationUTF16, err := windows.UTF16PtrFromString(destination)
	if err != nil {
		return err
	}
	return windows.MoveFile(sourceUTF16, destinationUTF16)
}
