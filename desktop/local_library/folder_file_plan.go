package local_library

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const folderFileOperationPlanKind = "folder_move_plan"

func folderFileOperationPlanPath(root, id string) string {
	return internalPath(root, "operations", id+".folder-plan.json")
}

func (m *Manager) PlanFolderMove(relative, destinationParent, topLevelName, conflictPolicy string) (FolderFileOperationPlan, error) {
	if conflictPolicy == "" {
		conflictPolicy = "skip"
	}
	if conflictPolicy != "skip" && conflictPolicy != "rename" {
		return FolderFileOperationPlan{}, newError(ErrInvalidPath, "不支持的冲突处理策略", nil)
	}
	session, err := m.requireAvailableSession()
	if err != nil {
		return FolderFileOperationPlan{}, err
	}
	source, _, err := normalizeRelative(relative)
	if err != nil || source == "" {
		return FolderFileOperationPlan{}, newError(ErrInvalidPath, "不能移动资源库根目录", nil)
	}
	parent, parentKey, err := normalizeRelative(destinationParent)
	if err != nil {
		return FolderFileOperationPlan{}, err
	}
	_, sourceKey, _ := normalizeRelative(string(source))
	if parentKey == sourceKey || strings.HasPrefix(parentKey, sourceKey+"/") {
		return FolderFileOperationPlan{}, newError(ErrInvalidPath, "不能将文件夹移入自身或其子文件夹", nil)
	}
	topLevelName, err = validateFolderName(topLevelName)
	if err != nil {
		return FolderFileOperationPlan{}, err
	}
	destination := topLevelName
	if parent != "" {
		destination = string(parent) + "/" + topLevelName
	}
	sourcePath, err := resolveWithinRoot(session.root, string(source))
	if err != nil {
		return FolderFileOperationPlan{}, err
	}
	destinationPath, err := resolveWithinRoot(session.root, destination)
	if err != nil {
		return FolderFileOperationPlan{}, err
	}
	if _, err := os.Stat(sourcePath); err != nil {
		return FolderFileOperationPlan{}, err
	}
	if _, err := os.Stat(filepath.Dir(destinationPath)); err != nil {
		return FolderFileOperationPlan{}, err
	}
	preview, err := m.PreviewFolderDeletion(string(source))
	if err != nil {
		return FolderFileOperationPlan{}, err
	}
	plan := FolderFileOperationPlan{ID: newID(), Version: 1, Kind: folderFileOperationPlanKind, Source: string(source), Destination: destination, ConflictPolicy: conflictPolicy, ManagedAssetCount: preview.ManagedAssetCount, OtherFileCount: preview.OtherFileCount, DirectoryCount: preview.DirectoryCount, TotalBytes: preview.TotalBytes, CreatedAt: time.Now().UTC()}
	if _, err := os.Lstat(destinationPath); err == nil {
		plan.ConflictCount = 1
		if conflictPolicy == "rename" {
			plan.Destination = nextAvailableFolderName(session.root, destination)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return FolderFileOperationPlan{}, err
	}
	plan.Items = append(plan.Items, FolderFileOperationItem{Source: plan.Source, Destination: plan.Destination, Kind: "folder", Conflict: plan.ConflictCount > 0})
	if err := writeJSONAtomic(folderFileOperationPlanPath(session.root, plan.ID), plan); err != nil {
		return FolderFileOperationPlan{}, err
	}
	return plan, nil
}

func nextAvailableFolderName(root, relative string) string {
	dir, name := filepath.ToSlash(filepath.Dir(filepath.FromSlash(relative))), filepath.Base(filepath.FromSlash(relative))
	for index := 1; ; index++ {
		candidateName := name + " (" + strconv.Itoa(index) + ")"
		candidate := candidateName
		if dir != "." && dir != "" {
			candidate = dir + "/" + candidateName
		}
		if _, err := os.Lstat(filepath.Join(root, filepath.FromSlash(candidate))); errors.Is(err, os.ErrNotExist) {
			return candidate
		}
	}
}

func (m *Manager) ExecuteFolderMovePlan(planID string) (FolderFileOperationExecution, error) {
	session, err := m.requireAvailableSession()
	if err != nil {
		return FolderFileOperationExecution{}, err
	}
	path := folderFileOperationPlanPath(session.root, planID)
	data, err := os.ReadFile(path)
	if err != nil {
		return FolderFileOperationExecution{}, err
	}
	var plan FolderFileOperationPlan
	if err := json.Unmarshal(data, &plan); err != nil || plan.ID != planID || plan.Version != 1 || plan.Kind != folderFileOperationPlanKind {
		return FolderFileOperationExecution{}, newError(ErrInvalidPath, "文件夹操作计划无效", nil)
	}
	destinationPath, err := resolveWithinRoot(session.root, plan.Destination)
	if err != nil {
		return FolderFileOperationExecution{}, err
	}
	if _, err := os.Lstat(destinationPath); err == nil {
		if plan.ConflictPolicy == "skip" {
			return FolderFileOperationExecution{PlanID: plan.ID, Status: "skipped"}, nil
		}
		plan.Destination = nextAvailableFolderName(session.root, plan.Destination)
	} else if !errors.Is(err, os.ErrNotExist) {
		return FolderFileOperationExecution{}, err
	}
	parent := filepath.ToSlash(filepath.Dir(filepath.FromSlash(plan.Destination)))
	if parent == "." {
		parent = ""
	}
	name := filepath.Base(filepath.FromSlash(plan.Destination))
	folder, err := m.MoveFolder(plan.Source, parent, name)
	if err != nil {
		return FolderFileOperationExecution{}, err
	}
	_ = os.Remove(path)
	return FolderFileOperationExecution{PlanID: plan.ID, Status: "completed", Folder: folder}, nil
}
