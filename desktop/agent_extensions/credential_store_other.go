//go:build !windows

package agent_extensions

import "errors"

type unsupportedCredentialStore struct{}

func NewCredentialStore() CredentialStore { return unsupportedCredentialStore{} }

func (unsupportedCredentialStore) Set(_, _ string) error {
	return errors.New("system credential storage is not implemented on this platform")
}
func (unsupportedCredentialStore) Get(_ string) (string, error) {
	return "", errors.New("system credential storage is not implemented on this platform")
}
func (unsupportedCredentialStore) Delete(_ string) error { return nil }
