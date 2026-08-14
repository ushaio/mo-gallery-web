package main

import "mo-gallery-desktop/db"

func (a *App) ListLocalDrafts() ([]string, error) { return db.ListLocalDrafts() }

func (a *App) GetLocalDraft(key string) (string, error) { return db.GetLocalDraft(key) }

func (a *App) SaveLocalDraft(key, data string) error { return db.SaveLocalDraft(key, data) }

func (a *App) DeleteLocalDraft(key string) error { return db.DeleteLocalDraft(key) }
