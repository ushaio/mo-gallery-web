package local_library

import (
	"encoding/json"
	"fmt"
	"time"
)

type LibraryID string
type AssetID string
type RelativePath string

type ErrorCode string

const (
	ErrInvalidPath              ErrorCode = "INVALID_PATH"
	ErrNestedLibrary            ErrorCode = "NESTED_LIBRARY"
	ErrInvalidLibrary           ErrorCode = "INVALID_LIBRARY"
	ErrLibraryLocked            ErrorCode = "LIBRARY_LOCKED"
	ErrNoActiveLibrary          ErrorCode = "NO_ACTIVE_LIBRARY"
	ErrAssetNotFound            ErrorCode = "ASSET_NOT_FOUND"
	ErrPathConflict             ErrorCode = "PATH_CONFLICT"
	ErrUnsupportedFile          ErrorCode = "UNSUPPORTED_FILE"
	ErrScanState                ErrorCode = "INVALID_SCAN_STATE"
	ErrLibrarySuspended         ErrorCode = "LIBRARY_SUSPENDED"
	ErrImportModeNotConfigured  ErrorCode = "IMPORT_MODE_NOT_CONFIGURED"
	ErrInvalidImportMode        ErrorCode = "INVALID_IMPORT_MODE"
	ErrTagNotFound              ErrorCode = "TAG_NOT_FOUND"
	ErrCollectionNotFound       ErrorCode = "COLLECTION_NOT_FOUND"
	ErrCollectionGroupNotFound  ErrorCode = "COLLECTION_GROUP_NOT_FOUND"
	ErrOrganizationNameConflict ErrorCode = "ORGANIZATION_NAME_CONFLICT"
	ErrCollectionGroupNotEmpty  ErrorCode = "COLLECTION_GROUP_NOT_EMPTY"
	ErrLibraryMaintenance       ErrorCode = "LIBRARY_MAINTENANCE"
	ErrBackupNotFound           ErrorCode = "BACKUP_NOT_FOUND"
	ErrBackupInvalid            ErrorCode = "BACKUP_INVALID"
)

type AppError struct {
	Code    ErrorCode      `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

func (e *AppError) Error() string {
	payload, err := json.Marshal(e)
	if err == nil {
		return string(payload)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.Message)
}

func newError(code ErrorCode, message string, details map[string]any) error {
	return &AppError{Code: code, Message: message, Details: details}
}

type Manifest struct {
	Format            string    `json:"format"`
	FormatVersion     int       `json:"formatVersion"`
	LibraryID         LibraryID `json:"libraryId"`
	Name              string    `json:"name"`
	CreatedAt         time.Time `json:"createdAt"`
	CreatedBy         string    `json:"createdBy"`
	MinimumAppVersion string    `json:"minimumAppVersion"`
}

type RecentLibrary struct {
	LibraryID    LibraryID `json:"libraryId"`
	Name         string    `json:"name"`
	Path         string    `json:"path"`
	LastOpenedAt time.Time `json:"lastOpenedAt"`
	Available    bool      `json:"available"`
	Reason       string    `json:"reason,omitempty"`
}

type ScanStatus struct {
	State      string     `json:"state"`
	Current    int64      `json:"current"`
	Total      *int64     `json:"total,omitempty"`
	LastPath   string     `json:"lastPath,omitempty"`
	Error      string     `json:"error,omitempty"`
	StartedAt  *time.Time `json:"startedAt,omitempty"`
	FinishedAt *time.Time `json:"finishedAt,omitempty"`
}

type LibrarySnapshot struct {
	SessionID    string     `json:"sessionId"`
	LibraryID    LibraryID  `json:"libraryId"`
	Name         string     `json:"name"`
	RootPath     string     `json:"rootPath"`
	State        string     `json:"state"`
	AssetCount   int64      `json:"assetCount"`
	MissingCount int64      `json:"missingCount"`
	TrashCount   int64      `json:"trashCount"`
	Scan         ScanStatus `json:"scan"`
}

type FolderDTO struct {
	ID           string  `json:"id"`
	ParentID     *string `json:"parentId,omitempty"`
	RelativePath string  `json:"relativePath"`
	Name         string  `json:"name"`
	AssetCount   int64   `json:"assetCount"`
}

type TagDTO struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Color      string `json:"color,omitempty"`
	AssetCount int64  `json:"assetCount"`
}

type CollectionGroupDTO struct {
	ID       string  `json:"id"`
	ParentID *string `json:"parentId,omitempty"`
	Name     string  `json:"name"`
	Position int     `json:"position"`
}

type CollectionDTO struct {
	ID         string  `json:"id"`
	GroupID    *string `json:"groupId,omitempty"`
	Name       string  `json:"name"`
	Notes      string  `json:"notes,omitempty"`
	Position   int     `json:"position"`
	AssetCount int64   `json:"assetCount"`
}

type AssetCollectionDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type ExifMetadataDTO struct {
	CameraMake     string   `json:"cameraMake,omitempty"`
	CameraModel    string   `json:"cameraModel,omitempty"`
	LensModel      string   `json:"lensModel,omitempty"`
	ISO            *int     `json:"iso,omitempty"`
	Aperture       *float64 `json:"aperture,omitempty"`
	ShutterSeconds *float64 `json:"shutterSeconds,omitempty"`
	FocalLengthMM  *float64 `json:"focalLengthMm,omitempty"`
	Latitude       *float64 `json:"latitude,omitempty"`
	Longitude      *float64 `json:"longitude,omitempty"`
}

type AssetDTO struct {
	ID             AssetID              `json:"id"`
	RelativePath   string               `json:"relativePath"`
	FileName       string               `json:"fileName"`
	Extension      string               `json:"extension"`
	Format         string               `json:"format"`
	MimeType       string               `json:"mimeType"`
	ByteSize       int64                `json:"byteSize"`
	ModifiedAtNS   int64                `json:"modifiedAtNs"`
	Width          int                  `json:"width"`
	Height         int                  `json:"height"`
	Orientation    int                  `json:"orientation"`
	IsAnimated     bool                 `json:"isAnimated"`
	FrameCount     int                  `json:"frameCount"`
	Availability   string               `json:"availability"`
	TrashEntryID   string               `json:"trashEntryId,omitempty"`
	TrashEntryKind string               `json:"trashEntryKind,omitempty"`
	PreviewStatus  string               `json:"previewStatus"`
	PreviewError   string               `json:"previewError,omitempty"`
	MetadataStatus string               `json:"metadataStatus"`
	DominantColors []string             `json:"dominantColors,omitempty"`
	DisplayTitle   string               `json:"displayTitle,omitempty"`
	Notes          string               `json:"notes,omitempty"`
	Rating         int                  `json:"rating"`
	ColorLabel     string               `json:"colorLabel,omitempty"`
	IsFavorite     bool                 `json:"isFavorite"`
	CapturedAt     *time.Time           `json:"capturedAt,omitempty"`
	EXIF           *ExifMetadataDTO     `json:"exif,omitempty"`
	DiscoveredAt   time.Time            `json:"discoveredAt"`
	ThumbnailURL   string               `json:"thumbnailUrl"`
	PreviewURL     string               `json:"previewUrl"`
	OriginalURL    string               `json:"originalUrl"`
	Tags           []TagDTO             `json:"tags"`
	Collections    []AssetCollectionDTO `json:"collections"`
}

type AssetPage struct {
	Items      []AssetDTO `json:"items"`
	NextCursor string     `json:"nextCursor,omitempty"`
	Total      int64      `json:"total"`
	IsComplete bool       `json:"isComplete"`
	Scan       ScanStatus `json:"scan"`
}

type AssetQuery struct {
	Cursor           string   `json:"cursor,omitempty"`
	Limit            int      `json:"limit,omitempty"`
	Folder           string   `json:"folder,omitempty"`
	DirectFolderOnly bool     `json:"directFolderOnly,omitempty"`
	Search           string   `json:"search,omitempty"`
	Availability     string   `json:"availability,omitempty"`
	FavoritesOnly    bool     `json:"favoritesOnly,omitempty"`
	TagIDs           []string `json:"tagIds,omitempty"`
	CollectionIDs    []string `json:"collectionIds,omitempty"`
	RatingMin        *int     `json:"ratingMin,omitempty"`
	RatingMax        *int     `json:"ratingMax,omitempty"`
	ColorLabels      []string `json:"colorLabels,omitempty"`
	Formats          []string `json:"formats,omitempty"`
	PreviewStatuses  []string `json:"previewStatuses,omitempty"`
	CapturedFromMS   *int64   `json:"capturedFromMs,omitempty"`
	CapturedToMS     *int64   `json:"capturedToMs,omitempty"`
	DiscoveredFromMS *int64   `json:"discoveredFromMs,omitempty"`
	DiscoveredToMS   *int64   `json:"discoveredToMs,omitempty"`
	CameraMakes      []string `json:"cameraMakes,omitempty"`
	CameraModels     []string `json:"cameraModels,omitempty"`
	LensModels       []string `json:"lensModels,omitempty"`
	ISOMin           *int     `json:"isoMin,omitempty"`
	ISOMax           *int     `json:"isoMax,omitempty"`
	ApertureMin      *float64 `json:"apertureMin,omitempty"`
	ApertureMax      *float64 `json:"apertureMax,omitempty"`
	FocalLengthMin   *float64 `json:"focalLengthMin,omitempty"`
	FocalLengthMax   *float64 `json:"focalLengthMax,omitempty"`
	Orientation      string   `json:"orientation,omitempty"`
	WidthMin         *int     `json:"widthMin,omitempty"`
	WidthMax         *int     `json:"widthMax,omitempty"`
	HeightMin        *int     `json:"heightMin,omitempty"`
	HeightMax        *int     `json:"heightMax,omitempty"`
	Sort             string   `json:"sort,omitempty"`
	SortDirection    string   `json:"sortDirection,omitempty"`
}

type AssetQueryToken struct {
	Token     string    `json:"token"`
	Total     int64     `json:"total"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type BatchAssetOrganizationUpdate struct {
	AssetIDs            []AssetID `json:"assetIds"`
	Rating              *int      `json:"rating,omitempty"`
	ColorLabel          *string   `json:"colorLabel,omitempty"`
	IsFavorite          *bool     `json:"isFavorite,omitempty"`
	AddTagIDs           []string  `json:"addTagIds,omitempty"`
	RemoveTagIDs        []string  `json:"removeTagIds,omitempty"`
	AddCollectionIDs    []string  `json:"addCollectionIds,omitempty"`
	RemoveCollectionIDs []string  `json:"removeCollectionIds,omitempty"`
}

type ImportResult struct {
	Source      string  `json:"source"`
	Destination string  `json:"destination,omitempty"`
	AssetID     AssetID `json:"assetId,omitempty"`
	Status      string  `json:"status"`
	Error       string  `json:"error,omitempty"`
}

type TrashResult struct {
	AssetID AssetID `json:"assetId"`
	Status  string  `json:"status"`
	Error   string  `json:"error,omitempty"`
}

// AssetMoveResult reports one real-file rename or move without changing asset identity.
type AssetMoveResult struct {
	AssetID     AssetID `json:"assetId"`
	Source      string  `json:"source,omitempty"`
	Destination string  `json:"destination,omitempty"`
	Status      string  `json:"status"`
	Error       string  `json:"error,omitempty"`
}

type AssetFileOperationItem struct {
	AssetID     AssetID `json:"assetId"`
	Source      string  `json:"source"`
	Destination string  `json:"destination"`
	Conflict    bool    `json:"conflict"`
	Warning     string  `json:"warning,omitempty"`
}

type AssetFileOperationPlan struct {
	ID                string                   `json:"id"`
	Version           int                      `json:"version"`
	Kind              string                   `json:"kind"`
	DestinationFolder string                   `json:"destinationFolder"`
	ConflictPolicy    string                   `json:"conflictPolicy"`
	Items             []AssetFileOperationItem `json:"items"`
	ConflictCount     int                      `json:"conflictCount"`
	TotalBytes        int64                    `json:"totalBytes"`
	CreatedAt         time.Time                `json:"createdAt"`
}

type AssetFileOperationExecution struct {
	PlanID  string            `json:"planId"`
	Status  string            `json:"status"`
	Results []AssetMoveResult `json:"results"`
}

type FolderFileOperationItem struct {
	Source      string `json:"source"`
	Destination string `json:"destination"`
	Kind        string `json:"kind"`
	Conflict    bool   `json:"conflict"`
}

type FolderFileOperationPlan struct {
	ID                string                    `json:"id"`
	Version           int                       `json:"version"`
	Kind              string                    `json:"kind"`
	Source            string                    `json:"source"`
	Destination       string                    `json:"destination"`
	ConflictPolicy    string                    `json:"conflictPolicy"`
	Items             []FolderFileOperationItem `json:"items"`
	ManagedAssetCount int64                     `json:"managedAssetCount"`
	OtherFileCount    int64                     `json:"otherFileCount"`
	DirectoryCount    int64                     `json:"directoryCount"`
	TotalBytes        int64                     `json:"totalBytes"`
	ConflictCount     int                       `json:"conflictCount"`
	CreatedAt         time.Time                 `json:"createdAt"`
}

type FolderFileOperationExecution struct {
	PlanID string    `json:"planId"`
	Status string    `json:"status"`
	Folder FolderDTO `json:"folder"`
}

// FolderDeletionPreview describes everything that will move with a real folder.
type FolderDeletionPreview struct {
	RelativePath      string `json:"relativePath"`
	Name              string `json:"name"`
	ManagedAssetCount int64  `json:"managedAssetCount"`
	OtherFileCount    int64  `json:"otherFileCount"`
	DirectoryCount    int64  `json:"directoryCount"`
	TotalBytes        int64  `json:"totalBytes"`
}

// FolderTrashEntry is one whole-directory recovery unit.
type FolderTrashEntry struct {
	ID                string    `json:"id"`
	OriginalPath      string    `json:"originalPath"`
	Name              string    `json:"name"`
	ManagedAssetCount int64     `json:"managedAssetCount"`
	OtherFileCount    int64     `json:"otherFileCount"`
	DirectoryCount    int64     `json:"directoryCount"`
	TotalBytes        int64     `json:"totalBytes"`
	TrashedAt         time.Time `json:"trashedAt"`
}

// AssetMaintenanceResult reports targeted index maintenance without implying a file deletion.
type AssetMaintenanceResult struct {
	AssetID AssetID `json:"assetId"`
	Status  string  `json:"status"`
	Error   string  `json:"error,omitempty"`
}

// LibraryEventState is the compact, mutable portion of a library snapshot.
// Events never carry library paths, names, or asset pages.
type LibraryEventState struct {
	State        string     `json:"state"`
	AssetCount   int64      `json:"assetCount"`
	MissingCount int64      `json:"missingCount"`
	TrashCount   int64      `json:"trashCount"`
	Scan         ScanStatus `json:"scan"`
}

type LocalLibraryEvent struct {
	SessionID     string             `json:"sessionId"`
	Kind          string             `json:"kind"`
	State         *LibraryEventState `json:"state,omitempty"`
	AssetID       AssetID            `json:"assetId,omitempty"`
	PreviewStatus string             `json:"previewStatus,omitempty"`
}
