package db

import (
	"time"

	"gorm.io/datatypes"
)

// ─── User ────────────────────────────────────────────

type User struct {
	ID             string     `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Username       string     `gorm:"type:text;uniqueIndex" json:"username"`
	Password       *string    `gorm:"type:text" json:"password,omitempty"`
	OAuthProvider  *string    `gorm:"type:text" json:"oauthProvider,omitempty"`
	OAuthID        *string    `gorm:"type:text" json:"oauthId,omitempty"`
	OAuthUsername  *string    `gorm:"type:text" json:"oauthUsername,omitempty"`
	AvatarURL      *string    `gorm:"type:text" json:"avatarUrl,omitempty"`
	TrustLevel     *int       `json:"trustLevel,omitempty"`
	IsAdmin        bool       `gorm:"default:false" json:"isAdmin"`
	CreatedAt      time.Time  `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt      time.Time  `gorm:"autoUpdateTime" json:"updatedAt"`
}

func (User) TableName() string { return "User" }

// ─── Camera ──────────────────────────────────────────

type Camera struct {
	ID        string    `gorm:"type:text;primaryKey" json:"id"`
	Name      string    `gorm:"type:text" json:"name"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"createdAt"`
}

func (Camera) TableName() string { return "Camera" }

// ─── Lens ────────────────────────────────────────────

type Lens struct {
	ID        string    `gorm:"type:text;primaryKey" json:"id"`
	Name      string    `gorm:"type:text" json:"name"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"createdAt"`
}

func (Lens) TableName() string { return "Lens" }

// ─── Photo ───────────────────────────────────────────

type Photo struct {
	ID              string     `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Title           string     `gorm:"type:text" json:"title"`
	URL             string     `gorm:"type:text" json:"url"`
	ThumbnailURL    *string    `gorm:"type:text" json:"thumbnailUrl,omitempty"`
	OriginFlag      string     `gorm:"type:text;default:web" json:"originFlag"`
	StorageProvider string     `gorm:"type:text;default:local" json:"storageProvider"`
	StorageSourceID *string    `gorm:"type:text" json:"storageSourceId,omitempty"`
	StorageKey      *string    `gorm:"type:text" json:"storageKey,omitempty"`
	Width           int        `json:"width"`
	Height          int        `json:"height"`
	Size            *int64     `json:"size,omitempty"`
	IsFeatured      bool       `gorm:"default:false" json:"isFeatured"`
	ShowFlag        bool       `gorm:"default:true" json:"showFlag"`
	DominantColors  *string    `gorm:"type:text" json:"dominantColors,omitempty"`
	FileHash        *string    `gorm:"type:text" json:"fileHash,omitempty"`
	CreatedAt       time.Time  `gorm:"autoCreateTime" json:"createdAt"`

	// 设备外键
	CameraID *string `gorm:"type:text" json:"cameraId,omitempty"`
	LensID   *string `gorm:"type:text" json:"lensId,omitempty"`

	// EXIF 信息
	CameraMake   *string    `gorm:"type:text" json:"cameraMake,omitempty"`
	CameraModel  *string    `gorm:"type:text" json:"cameraModel,omitempty"`
	LensModel    *string    `gorm:"type:text" json:"lensModel,omitempty"`
	FocalLength  *string    `gorm:"type:text" json:"focalLength,omitempty"`
	Aperture     *string    `gorm:"type:text" json:"aperture,omitempty"`
	ShutterSpeed *string    `gorm:"type:text" json:"shutterSpeed,omitempty"`
	ISO          *int       `json:"iso,omitempty"`
	TakenAt      *time.Time `json:"takenAt,omitempty"`
	Orientation  *int       `json:"orientation,omitempty"`
	Software     *string    `gorm:"type:text" json:"software,omitempty"`
	ExifRaw      *string    `gorm:"type:text" json:"exifRaw,omitempty"`
	GPS          *string    `gorm:"type:text" json:"gps,omitempty"` // JSON string

	// 关联
	Camera    *Camera    `gorm:"foreignKey:CameraID" json:"camera,omitempty"`
	Lens      *Lens      `gorm:"foreignKey:LensID" json:"lens,omitempty"`
	Categories []Category `gorm:"many2many:PhotoCategories" json:"categories,omitempty"`
	Albums     []Album    `gorm:"many2many:AlbumPhotos" json:"albums,omitempty"`
	Stories    []Story    `gorm:"many2many:PhotoStories" json:"stories,omitempty"`
	FilmPhoto  *FilmPhoto `json:"filmPhoto,omitempty"`
	Comments   []Comment  `json:"comments,omitempty"`
}

func (Photo) TableName() string { return "Photo" }

// ─── FilmRoll ────────────────────────────────────────

type FilmRoll struct {
	ID         string     `gorm:"type:text;primaryKey" json:"id"`
	Name       string     `gorm:"type:text" json:"name"`
	Brand      string     `gorm:"type:text" json:"brand"`
	Format     string     `gorm:"type:text;default:135" json:"format"`
	ISO        int        `json:"iso"`
	FrameCount int        `json:"frameCount"`
	Notes      *string    `gorm:"type:text" json:"notes,omitempty"`
	ShootDate  *time.Time `json:"shootDate,omitempty"`
	EndDate    *time.Time `json:"endDate,omitempty"`
	CreatedAt  time.Time  `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt  time.Time  `gorm:"autoUpdateTime" json:"updatedAt"`

	FilmPhotos []FilmPhoto `json:"filmPhotos,omitempty"`
}

func (FilmRoll) TableName() string { return "FilmRoll" }

// ─── FilmPhoto ───────────────────────────────────────

type FilmPhoto struct {
	ID          string    `gorm:"type:text;primaryKey" json:"id"`
	FilmRollID  string    `gorm:"type:text" json:"filmRollId"`
	PhotoID     string    `gorm:"type:text;uniqueIndex" json:"photoId"`
	FrameNumber int       `json:"frameNumber"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"createdAt"`

	FilmRoll FilmRoll `gorm:"foreignKey:FilmRollID" json:"filmRoll,omitempty"`
	Photo    Photo    `gorm:"foreignKey:PhotoID" json:"photo,omitempty"`
}

func (FilmPhoto) TableName() string { return "FilmPhoto" }

// ─── Album ───────────────────────────────────────────

type Album struct {
	ID          string    `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Name        string    `gorm:"type:text" json:"name"`
	Description *string   `gorm:"type:text" json:"description,omitempty"`
	CoverURL    *string   `gorm:"type:text" json:"coverUrl,omitempty"`
	IsPublished bool      `gorm:"default:false" json:"isPublished"`
	SortOrder   int       `gorm:"default:0" json:"sortOrder"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updatedAt"`

	Photos []Photo `gorm:"many2many:AlbumPhotos" json:"photos,omitempty"`
}

func (Album) TableName() string { return "Album" }

// ─── Category ────────────────────────────────────────

type Category struct {
	ID     string  `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Name   string  `gorm:"type:text;uniqueIndex" json:"name"`
	Photos []Photo `gorm:"many2many:PhotoCategories" json:"photos,omitempty"`
}

func (Category) TableName() string { return "Category" }

// ─── Setting ─────────────────────────────────────────

type Setting struct {
	ID    string `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Key   string `gorm:"type:text;uniqueIndex" json:"key"`
	Value string `gorm:"type:text" json:"value"`
}

func (Setting) TableName() string { return "Setting" }

// ─── StorageSource ───────────────────────────────────

type StorageSource struct {
	ID           string    `gorm:"type:text;primaryKey" json:"id"`
	Name         string    `gorm:"type:text" json:"name"`
	Type         string    `gorm:"type:text" json:"type"` // local, github, s3
	AccessKey    *string   `gorm:"type:text" json:"accessKey,omitempty"`
	SecretKey    *string   `gorm:"type:text" json:"secretKey,omitempty"`
	Bucket       *string   `gorm:"type:text" json:"bucket,omitempty"`
	Region       *string   `gorm:"type:text" json:"region,omitempty"`
	Endpoint     *string   `gorm:"type:text" json:"endpoint,omitempty"`
	PublicURL    *string   `gorm:"type:text" json:"publicUrl,omitempty"`
	BasePath     *string   `gorm:"type:text" json:"basePath,omitempty"`
	Branch       *string   `gorm:"type:text" json:"branch,omitempty"`
	AccessMethod *string   `gorm:"type:text" json:"accessMethod,omitempty"`
	CreatedAt    time.Time `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt    time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
}

func (StorageSource) TableName() string { return "StorageSource" }

// ─── Story ───────────────────────────────────────────

type Story struct {
	ID           string     `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Title        string     `gorm:"type:text" json:"title"`
	Content      string     `gorm:"type:text" json:"content"`
	ContentJSON  *string    `gorm:"type:text" json:"contentJson,omitempty"`
	CoverPhotoID *string    `gorm:"type:text" json:"coverPhotoId,omitempty"`
	CoverCrop    *string    `gorm:"type:text" json:"coverCrop,omitempty"` // JSON string
	IsPublished  bool       `gorm:"default:false" json:"isPublished"`
	StoryDate    time.Time  `gorm:"autoCreateTime" json:"storyDate"`
	CreatedAt    time.Time  `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt    time.Time  `gorm:"autoUpdateTime" json:"updatedAt"`

	Photos []Photo `gorm:"many2many:PhotoStories" json:"photos,omitempty"`
}

func (Story) TableName() string { return "Story" }

// ─── Comment ─────────────────────────────────────────

type Comment struct {
	ID        string    `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	PhotoID   string    `gorm:"type:text" json:"photoId"`
	Author    string    `gorm:"type:text" json:"author"`
	Email     *string   `gorm:"type:text" json:"email,omitempty"`
	AvatarURL *string   `gorm:"type:text" json:"avatarUrl,omitempty"`
	Content   string    `gorm:"type:text" json:"content"`
	Status    string    `gorm:"type:text;default:pending" json:"status"` // pending, approved, rejected
	IP        *string   `gorm:"type:text" json:"ip,omitempty"`
	CreatedAt time.Time `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt time.Time `gorm:"autoUpdateTime" json:"updatedAt"`

	Photo Photo `gorm:"foreignKey:PhotoID" json:"photo,omitempty"`
}

func (Comment) TableName() string { return "Comment" }

// ─── Blog ────────────────────────────────────────────

type Blog struct {
	ID          string     `gorm:"type:uuid;default:gen_random_uuid();primaryKey" json:"id"`
	Title       string     `gorm:"type:text" json:"title"`
	Content     string     `gorm:"type:text" json:"content"`
	ContentJSON *string    `gorm:"type:text" json:"contentJson,omitempty"`
	Category    string     `gorm:"type:text;default:未分类" json:"category"`
	Tags        string     `gorm:"type:text;default:" json:"tags"`
	IsPublished bool       `gorm:"default:false" json:"isPublished"`
	CreatedAt   time.Time  `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt   time.Time  `gorm:"autoUpdateTime" json:"updatedAt"`
}

func (Blog) TableName() string { return "Blog" }

// ─── FriendLink ──────────────────────────────────────

type FriendLink struct {
	ID          string    `gorm:"type:text;primaryKey" json:"id"`
	Name        string    `gorm:"type:text" json:"name"`
	URL         string    `gorm:"type:text" json:"url"`
	Description *string   `gorm:"type:text" json:"description,omitempty"`
	Avatar      *string   `gorm:"type:text" json:"avatar,omitempty"`
	Featured    bool      `gorm:"default:false" json:"featured"`
	SortOrder   int       `gorm:"default:0" json:"sortOrder"`
	IsActive    bool      `gorm:"default:true" json:"isActive"`
	CreatedAt   time.Time `gorm:"autoCreateTime" json:"createdAt"`
	UpdatedAt   time.Time `gorm:"autoUpdateTime" json:"updatedAt"`
}

func (FriendLink) TableName() string { return "FriendLink" }

// ─── AiConversation ──────────────────────────────────

type AiConversation struct {
	ID           string    `gorm:"column:id;type:text;primaryKey" json:"id"`
	ScopeID      string    `gorm:"column:scopeId;type:text" json:"scopeId"`
	Title        *string   `gorm:"column:title;type:text" json:"title,omitempty"`
	Summary      *string   `gorm:"column:summary;type:text" json:"summary,omitempty"`
	LastModel    *string   `gorm:"column:lastModel;type:text" json:"lastModel,omitempty"`
	SystemPrompt *string   `gorm:"column:systemPrompt;type:text" json:"systemPrompt,omitempty"`
	CreatedAt    time.Time `gorm:"column:createdAt;autoCreateTime" json:"createdAt"`
	UpdatedAt    time.Time `gorm:"column:updatedAt;autoUpdateTime" json:"updatedAt"`

	Messages []AiMessage `gorm:"foreignKey:ConversationID" json:"messages,omitempty"`
}

func (AiConversation) TableName() string { return "AiConversation" }

// ─── AiMessage ───────────────────────────────────────

type AiMessage struct {
	ID             string         `gorm:"column:id;type:text;primaryKey" json:"id"`
	ConversationID string         `gorm:"column:conversationId;type:text" json:"conversationId"`
	Role           string         `gorm:"column:role;type:text" json:"role"`
	Content        string         `gorm:"column:content;type:text" json:"content"`
	Status         string         `gorm:"column:status;type:text;default:completed" json:"status"`
	Model          *string        `gorm:"column:model;type:text" json:"model,omitempty"`
	Action         *string        `gorm:"column:action;type:text" json:"action,omitempty"`
	Metadata       datatypes.JSON `gorm:"column:metadata;type:jsonb" json:"metadata,omitempty"`
	Error          *string        `gorm:"column:error;type:text" json:"error,omitempty"`
	CreatedAt      time.Time      `gorm:"column:createdAt;autoCreateTime" json:"createdAt"`

	Conversation AiConversation `gorm:"foreignKey:ConversationID" json:"conversation,omitempty"`
}

func (AiMessage) TableName() string { return "AiMessage" }
