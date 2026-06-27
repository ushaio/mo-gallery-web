package image

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/rwcarlsen/goexif/exif"
)

// ExifData 提取的 EXIF 数据
type ExifData struct {
	CameraMake   string     `json:"cameraMake,omitempty"`
	CameraModel  string     `json:"cameraModel,omitempty"`
	LensModel    string     `json:"lensModel,omitempty"`
	FocalLength  string     `json:"focalLength,omitempty"`
	Aperture     string     `json:"aperture,omitempty"`
	ShutterSpeed string     `json:"shutterSpeed,omitempty"`
	ISO          int        `json:"iso,omitempty"`
	TakenAt      *time.Time `json:"takenAt,omitempty"`
	Orientation  int        `json:"orientation,omitempty"`
	Software     string     `json:"software,omitempty"`
	GPS          *GPSData   `json:"gps,omitempty"`
	Raw          string     `json:"raw,omitempty"`
}

type GPSData struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Altitude  float64 `json:"altitude,omitempty"`
	DateStamp string  `json:"dateStamp,omitempty"`
}

// ExtractExif 从文件中提取 EXIF 数据
func ExtractExif(filePath string) (*ExifData, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("打开文件失败: %w", err)
	}
	defer f.Close()

	return ExtractExifFromReader(f)
}

// ExtractExifFromReader 从 reader 中提取 EXIF 数据
func ExtractExifFromReader(r io.Reader) (*ExifData, error) {
	// 读取全部内容以便同时用于 EXIF 解析和原始数据保存
	data, err := io.ReadAll(r)
	if err != nil {
		return nil, fmt.Errorf("读取文件失败: %w", err)
	}

	x, err := exif.Decode(bytes.NewReader(data))
	if err != nil {
		// 无法解析 EXIF（可能没有 EXIF 数据），返回空结果
		return &ExifData{}, nil
	}

	result := &ExifData{}

	// 相机信息
	result.CameraMake = getExifString(x, exif.Make)
	result.CameraModel = getExifString(x, exif.Model)
	result.LensModel = getExifString(x, exif.LensModel)
	result.Software = getExifString(x, exif.Software)

	// 焦距
	if tag, err := x.Get(exif.FocalLength); err == nil {
		if num, den, err := tag.Rat2(0); err == nil && den != 0 {
			fl := float64(num) / float64(den)
			if fl == float64(int(fl)) {
				result.FocalLength = fmt.Sprintf("%dmm", int(fl))
			} else {
				result.FocalLength = fmt.Sprintf("%.1fmm", fl)
			}
		}
	}

	// 光圈
	if tag, err := x.Get(exif.FNumber); err == nil {
		if num, den, err := tag.Rat2(0); err == nil && den != 0 {
			av := float64(num) / float64(den)
			result.Aperture = fmt.Sprintf("f/%.1f", av)
		}
	}

	// 快门速度
	if tag, err := x.Get(exif.ExposureTime); err == nil {
		if num, den, err := tag.Rat2(0); err == nil && den != 0 {
			if num == 1 {
				result.ShutterSpeed = fmt.Sprintf("1/%d", den)
			} else {
				result.ShutterSpeed = fmt.Sprintf("%d/%d", num, den)
			}
		}
	}

	// ISO
	if tag, err := x.Get(exif.ISOSpeedRatings); err == nil {
		if v, err := tag.Int(0); err == nil {
			result.ISO = v
		}
	}

	// 拍摄时间
	if tag, err := x.Get(exif.DateTimeOriginal); err == nil {
		if s, err := tag.StringVal(); err == nil {
			if t, err := time.Parse("2006:01:02 15:04:05", s); err == nil {
				result.TakenAt = &t
			}
		}
	}

	// 方向
	if tag, err := x.Get(exif.Orientation); err == nil {
		if v, err := tag.Int(0); err == nil {
			result.Orientation = v
		}
	}

	// GPS
	if lat, long, err := x.LatLong(); err == nil && (lat != 0 || long != 0) {
		gps := &GPSData{
			Latitude:  lat,
			Longitude: long,
		}
		// 尝试获取海拔
		if tag, err := x.Get(exif.GPSAltitude); err == nil {
			if num, den, err := tag.Rat2(0); err == nil && den != 0 {
				gps.Altitude = float64(num) / float64(den)
			}
		}
		// GPS 日期
		if tag, err := x.Get(exif.GPSDateStamp); err == nil {
			if s, err := tag.StringVal(); err == nil {
				gps.DateStamp = s
			}
		}
		result.GPS = gps
	}

	// 保存原始 EXIF JSON
	rawMap := map[string]interface{}{}
	for _, field := range []exif.FieldName{
		exif.Make, exif.Model, exif.LensModel, exif.FocalLength,
		exif.FNumber, exif.ExposureTime, exif.ISOSpeedRatings,
		exif.DateTimeOriginal, exif.Orientation, exif.Software,
	} {
		if tag, err := x.Get(field); err == nil {
			rawMap[string(field)] = tag.String()
		}
	}
	if rawBytes, err := json.Marshal(rawMap); err == nil {
		result.Raw = string(rawBytes)
	}

	return result, nil
}

func getExifString(x *exif.Exif, field exif.FieldName) string {
	tag, err := x.Get(field)
	if err != nil {
		return ""
	}
	s, err := tag.StringVal()
	if err != nil {
		return ""
	}
	return s
}
