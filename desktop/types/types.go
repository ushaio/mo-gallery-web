package types

// StorageSourceDTO 存储源（Web API 响应格式）
type StorageSourceDTO struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Type         string  `json:"type"`
	AccessKey    *string `json:"accessKey,omitempty"`
	SecretKey    *string `json:"secretKey,omitempty"`
	Bucket       *string `json:"bucket,omitempty"`
	Region       *string `json:"region,omitempty"`
	Endpoint     *string `json:"endpoint,omitempty"`
	PublicURL    *string `json:"publicUrl,omitempty"`
	BasePath     *string `json:"basePath,omitempty"`
	Branch       *string `json:"branch,omitempty"`
	AccessMethod *string `json:"accessMethod,omitempty"`
}
