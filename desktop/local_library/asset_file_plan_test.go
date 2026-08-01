package local_library

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAssetMovePlanRechecksConflictsAndSupportsRename(t *testing.T) {
	manager, root := openTestManager(t)
	if _, err := manager.CreateFolder("", "Destination"); err != nil {
		t.Fatal(err)
	}
	writeTestJPEG(t, filepath.Join(root, "source.jpg"))
	id := indexTestFile(t, manager, root, "source.jpg")

	plan, err := manager.PlanAssetMove([]AssetID{id}, "Destination", "rename")
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Items) != 1 || plan.Items[0].Destination != "Destination/source.jpg" || plan.ConflictCount != 0 {
		t.Fatalf("unexpected plan=%+v", plan)
	}
	writeTestJPEG(t, filepath.Join(root, "Destination", "source.jpg"))

	execution, err := manager.ExecuteAssetMovePlan(plan.ID)
	if err != nil {
		t.Fatal(err)
	}
	if execution.Status != "completed" || len(execution.Results) != 1 || execution.Results[0].Status != "moved" || execution.Results[0].Destination != "Destination/source (1).jpg" {
		t.Fatalf("unexpected execution=%+v", execution)
	}
	if _, err := os.Stat(filepath.Join(root, "Destination", "source (1).jpg")); err != nil {
		t.Fatal(err)
	}
}

func TestAssetMovePlanSkipsPlannedConflict(t *testing.T) {
	manager, root := openTestManager(t)
	if _, err := manager.CreateFolder("", "Destination"); err != nil {
		t.Fatal(err)
	}
	writeTestJPEG(t, filepath.Join(root, "source.jpg"))
	id := indexTestFile(t, manager, root, "source.jpg")
	writeTestJPEG(t, filepath.Join(root, "Destination", "source.jpg"))

	plan, err := manager.PlanAssetMove([]AssetID{id}, "Destination", "skip")
	if err != nil {
		t.Fatal(err)
	}
	if plan.ConflictCount != 1 || !plan.Items[0].Conflict {
		t.Fatalf("unexpected conflict plan=%+v", plan)
	}
	execution, err := manager.ExecuteAssetMovePlan(plan.ID)
	if err != nil {
		t.Fatal(err)
	}
	if execution.Status != "partial" || execution.Results[0].Status != "skipped" {
		t.Fatalf("unexpected execution=%+v", execution)
	}
	if _, err := os.Stat(filepath.Join(root, "source.jpg")); err != nil {
		t.Fatal(err)
	}
}
