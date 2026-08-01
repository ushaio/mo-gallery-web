package local_library

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFolderMovePlanReportsStatsAndExecutes(t *testing.T) {
	manager, root := openTestManager(t)
	if _, err := manager.CreateFolder("", "Source"); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.CreateFolder("", "Destination"); err != nil {
		t.Fatal(err)
	}
	writeTestJPEG(t, filepath.Join(root, "Source", "photo.jpg"))
	_ = indexTestFile(t, manager, root, "Source/photo.jpg")
	if err := os.WriteFile(filepath.Join(root, "Source", "note.txt"), []byte("note"), 0o600); err != nil {
		t.Fatal(err)
	}
	plan, err := manager.PlanFolderMove("Source", "Destination", "Moved", "skip")
	if err != nil {
		t.Fatal(err)
	}
	if plan.ManagedAssetCount != 1 || plan.OtherFileCount != 1 || plan.TotalBytes <= 0 {
		t.Fatalf("plan=%+v", plan)
	}
	execution, err := manager.ExecuteFolderMovePlan(plan.ID)
	if err != nil {
		t.Fatal(err)
	}
	if execution.Status != "completed" || execution.Folder.RelativePath != "Destination/Moved" {
		t.Fatalf("execution=%+v", execution)
	}
}

func TestFolderMovePlanAutoRenamesConflict(t *testing.T) {
	manager, root := openTestManager(t)
	if _, err := manager.CreateFolder("", "Source"); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.CreateFolder("", "Destination"); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.CreateFolder("Destination", "Moved"); err != nil {
		t.Fatal(err)
	}
	plan, err := manager.PlanFolderMove("Source", "Destination", "Moved", "rename")
	if err != nil {
		t.Fatal(err)
	}
	if plan.ConflictCount != 1 || plan.Destination != "Destination/Moved (1)" {
		t.Fatalf("plan=%+v", plan)
	}
	execution, err := manager.ExecuteFolderMovePlan(plan.ID)
	if err != nil {
		t.Fatal(err)
	}
	if execution.Folder.RelativePath != "Destination/Moved (1)" {
		t.Fatalf("execution=%+v", execution)
	}
	if _, err := os.Stat(filepath.Join(root, "Destination", "Moved (1)")); err != nil {
		t.Fatal(err)
	}
}
