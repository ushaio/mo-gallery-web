package services

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode/utf16"

	"golang.org/x/image/font/sfnt"
)

// Font paths remain internal. Callers select installed names, never file paths.
type zineFontFace struct {
	path           string
	index          int
	family         string
	postscriptName string
	rank           int
}

type zineFontCatalog struct {
	aliases  map[string]*zineFontFace
	families []string
}

type zineFontInfo struct {
	Found          bool   `json:"found"`
	Family         string `json:"family"`
	PostscriptName string `json:"postscriptName"`
	URL            string `json:"url"`
}

type zineFontResource struct {
	data    []byte
	version string
	mime    string
}

var (
	zineFontCatalogOnce sync.Once
	zineFonts           zineFontCatalog
	zineFontResourceMu  sync.Mutex
	zineFontResources   = make(map[*zineFontFace]*zineFontResource)
)

func normalizeZineFontFamily(family string) string {
	return strings.ToLower(strings.Join(strings.Fields(strings.Trim(family, " \t\r\n\"'")), " "))
}

func getZineFontCatalog() *zineFontCatalog {
	zineFontCatalogOnce.Do(func() {
		zineFonts.aliases = make(map[string]*zineFontFace)
		families := make(map[string]struct{})
		for _, path := range zineSystemFontPaths() {
			data, err := os.ReadFile(path)
			if err != nil {
				continue
			}
			collection, err := sfnt.ParseCollection(data)
			if err != nil {
				continue
			}
			for index := 0; index < collection.NumFonts(); index++ {
				font, err := collection.Font(index)
				if err != nil {
					continue
				}
				family, _ := font.Name(nil, sfnt.NameIDFamily)
				postscriptName, _ := font.Name(nil, sfnt.NameIDPostScript)
				family = strings.TrimSpace(family)
				postscriptName = strings.TrimSpace(postscriptName)
				if family == "" || postscriptName == "" {
					continue
				}
				_, tables, err := readZineFontTables(data, index)
				if err != nil {
					continue
				}
				face := &zineFontFace{path: path, index: index, family: family, postscriptName: postscriptName, rank: zineFontFaceRank(tables)}
				aliases := append(zineFontAliases(tables), family, postscriptName)
				for _, alias := range aliases {
					key := normalizeZineFontFamily(alias)
					if key == "" {
						continue
					}
					previous := zineFonts.aliases[key]
					if previous == nil || face.rank < previous.rank {
						zineFonts.aliases[key] = face
					}
				}
				families[family] = struct{}{}
			}
		}
		for family := range families {
			zineFonts.families = append(zineFonts.families, family)
		}
		sort.Strings(zineFonts.families)
	})
	return &zineFonts
}

func resolveZineFontFace(requested string) *zineFontFace {
	family := normalizeZineFontFamily(requested)
	catalog := getZineFontCatalog()
	var candidates []string
	switch family {
	case "serif":
		candidates = []string{"Times New Roman", "Times", "Noto Serif", "Liberation Serif", "DejaVu Serif"}
	case "sans-serif", "system-ui":
		candidates = []string{"Arial", "Helvetica", "Noto Sans", "Liberation Sans", "DejaVu Sans"}
		if family == "system-ui" && runtime.GOOS == "windows" {
			candidates = append([]string{"Segoe UI"}, candidates...)
		}
	case "monospace":
		candidates = []string{"Courier New", "Menlo", "Monaco", "Noto Sans Mono", "Liberation Mono", "DejaVu Sans Mono"}
	case "__zine-cjk-serif":
		candidates = []string{"SimSun", "Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", "Source Han Serif CN", "AR PL UMing CN"}
	case "__zine-cjk-sans":
		candidates = []string{"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", "Source Han Sans CN", "WenQuanYi Micro Hei", "WenQuanYi Zen Hei", "SimHei", "Microsoft JhengHei"}
	default:
		return catalog.aliases[family]
	}
	for _, candidate := range candidates {
		if face := catalog.aliases[normalizeZineFontFamily(candidate)]; face != nil {
			return face
		}
	}
	return nil
}

// Snapshot the selected face for this app session. Both FontFace and react-pdf
// request the same versioned bytes even if the installed file changes later.
func loadZineFontResource(face *zineFontFace) (*zineFontResource, error) {
	zineFontResourceMu.Lock()
	defer zineFontResourceMu.Unlock()
	if resource := zineFontResources[face]; resource != nil {
		return resource, nil
	}
	data, err := os.ReadFile(face.path)
	if err != nil {
		return nil, fmt.Errorf("read installed font: %w", err)
	}
	data, err = extractZineFontFace(data, face.index)
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256(data)
	resource := &zineFontResource{data: data, version: fmt.Sprintf("%x", digest), mime: "font/ttf"}
	if string(data[:4]) == "OTTO" {
		resource.mime = "font/otf"
	}
	zineFontResources[face] = resource
	return resource, nil
}

func registerZineFontRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/__zine/font-info", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		requested := strings.TrimSpace(r.URL.Query().Get("family"))
		info := zineFontInfo{Family: requested}
		if face := resolveZineFontFace(requested); face != nil {
			resource, err := loadZineFontResource(face)
			if err != nil {
				http.Error(w, err.Error(), http.StatusUnprocessableEntity)
				return
			}
			info = zineFontInfo{
				Found: true, Family: face.family, PostscriptName: face.postscriptName,
				URL: "/__zine/font?family=" + url.QueryEscape(requested) + "&v=" + resource.version,
			}
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(info)
	})
	mux.HandleFunc("/__zine/font", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		face := resolveZineFontFace(r.URL.Query().Get("family"))
		if face == nil {
			http.Error(w, "installed font not found", http.StatusNotFound)
			return
		}
		resource, err := loadZineFontResource(face)
		if err != nil {
			http.Error(w, err.Error(), http.StatusUnprocessableEntity)
			return
		}
		if version := r.URL.Query().Get("v"); version != "" && version != resource.version {
			http.Error(w, "font changed; reload the project before exporting", http.StatusConflict)
			return
		}
		w.Header().Set("Content-Type", resource.mime)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("ETag", `"`+resource.version+`"`)
		w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
		http.ServeContent(w, r, face.postscriptName, time.Time{}, bytes.NewReader(resource.data))
	})
}

type zineSFNTTable struct {
	tag  uint32
	data []byte
}

func readZineFontTables(data []byte, index int) (uint32, []zineSFNTTable, error) {
	if len(data) < 12 || index < 0 {
		return 0, nil, fmt.Errorf("invalid font header")
	}
	var offset uint64
	if string(data[:4]) == "ttcf" {
		count := uint64(binary.BigEndian.Uint32(data[8:12]))
		if uint64(index) >= count || 12+count*4 > uint64(len(data)) {
			return 0, nil, fmt.Errorf("invalid font collection index")
		}
		offset = uint64(binary.BigEndian.Uint32(data[12+index*4 : 16+index*4]))
	} else if index != 0 {
		return 0, nil, fmt.Errorf("invalid standalone font index")
	}
	if offset+12 > uint64(len(data)) {
		return 0, nil, fmt.Errorf("invalid font face offset")
	}
	header := data[offset:]
	flavor := binary.BigEndian.Uint32(header[:4])
	if flavor != 0x00010000 && flavor != 0x4f54544f && flavor != 0x74727565 {
		return 0, nil, fmt.Errorf("unsupported font format")
	}
	count := int(binary.BigEndian.Uint16(header[4:6]))
	if count == 0 || count > 4095 || uint64(count*16+12) > uint64(len(header)) {
		return 0, nil, fmt.Errorf("invalid font table directory")
	}
	tables := make([]zineSFNTTable, 0, count)
	seen := make(map[uint32]bool)
	for i := 0; i < count; i++ {
		record := header[12+i*16 : 28+i*16]
		tag := binary.BigEndian.Uint32(record[:4])
		start := uint64(binary.BigEndian.Uint32(record[8:12]))
		length := uint64(binary.BigEndian.Uint32(record[12:16]))
		if start+length > uint64(len(data)) || seen[tag] {
			return 0, nil, fmt.Errorf("invalid font table")
		}
		seen[tag] = true
		tables = append(tables, zineSFNTTable{tag: tag, data: data[start : start+length]})
	}
	return flavor, tables, nil
}

func zineFontTable(tables []zineSFNTTable, tag string) []byte {
	key := binary.BigEndian.Uint32([]byte(tag))
	for _, table := range tables {
		if table.tag == key {
			return table.data
		}
	}
	return nil
}

// Name() selects one language. Retain all Unicode family/full/PostScript names
// as aliases so choices such as 宋体 and SimSun resolve to the same face.
func zineFontAliases(tables []zineSFNTTable) []string {
	data := zineFontTable(tables, "name")
	if len(data) < 6 {
		return nil
	}
	count := int(binary.BigEndian.Uint16(data[2:4]))
	storage := int(binary.BigEndian.Uint16(data[4:6]))
	if 6+count*12 > len(data) {
		return nil
	}
	var names []string
	for i := 0; i < count; i++ {
		record := data[6+i*12 : 18+i*12]
		platform := binary.BigEndian.Uint16(record[:2])
		nameID := binary.BigEndian.Uint16(record[6:8])
		if (platform != 0 && platform != 3) || (nameID != 1 && nameID != 4 && nameID != 6 && nameID != 16 && nameID != 21) {
			continue
		}
		length := int(binary.BigEndian.Uint16(record[8:10]))
		start := storage + int(binary.BigEndian.Uint16(record[10:12]))
		if length%2 != 0 || start+length > len(data) {
			continue
		}
		units := make([]uint16, length/2)
		for j := range units {
			units[j] = binary.BigEndian.Uint16(data[start+j*2 : start+j*2+2])
		}
		names = append(names, string(utf16.Decode(units)))
	}
	return names
}

// TextSlot currently stores a family only. Prefer its normal, upright face.
func zineFontFaceRank(tables []zineSFNTTable) int {
	rank := 0
	if os2 := zineFontTable(tables, "OS/2"); len(os2) >= 64 {
		weight := int(binary.BigEndian.Uint16(os2[4:6]))
		rank = weight - 400
		if rank < 0 {
			rank = -rank
		}
		width := int(binary.BigEndian.Uint16(os2[6:8])) - 5
		if width < 0 {
			width = -width
		}
		rank += width * 100
		if binary.BigEndian.Uint16(os2[62:64])&1 != 0 {
			rank += 10000
		}
	} else if head := zineFontTable(tables, "head"); len(head) >= 46 {
		style := binary.BigEndian.Uint16(head[44:46])
		if style&1 != 0 {
			rank += 300
		}
		if style&2 != 0 {
			rank += 10000
		}
	}
	return rank
}

// TTC table offsets refer to the collection, so copying a face's header is not
// sufficient. Rebuild a standalone SFNT, including padded tables and checksums.
func extractZineFontFace(data []byte, index int) ([]byte, error) {
	flavor, tables, err := readZineFontTables(data, index)
	if err != nil {
		return nil, err
	}
	if os2 := zineFontTable(tables, "OS/2"); len(os2) >= 10 {
		fsType := binary.BigEndian.Uint16(os2[8:10])
		if fsType&(0x0002|0x0100|0x0200) != 0 {
			return nil, fmt.Errorf("font does not permit subset outline embedding; choose an embeddable font")
		}
	}
	filtered := tables[:0]
	for _, table := range tables {
		if table.tag != 0x44534947 { // Extraction invalidates DSIG signatures.
			filtered = append(filtered, table)
		}
	}
	tables = filtered
	sort.Slice(tables, func(i, j int) bool { return tables[i].tag < tables[j].tag })
	length := 12 + len(tables)*16
	for _, table := range tables {
		length += (len(table.data) + 3) &^ 3
	}
	result := make([]byte, length)
	binary.BigEndian.PutUint32(result[:4], flavor)
	binary.BigEndian.PutUint16(result[4:6], uint16(len(tables)))
	power, selector := 1, 0
	for power*2 <= len(tables) {
		power *= 2
		selector++
	}
	binary.BigEndian.PutUint16(result[6:8], uint16(power*16))
	binary.BigEndian.PutUint16(result[8:10], uint16(selector))
	binary.BigEndian.PutUint16(result[10:12], uint16(len(tables)*16-power*16))
	offset, headOffset := 12+len(tables)*16, -1
	for i, table := range tables {
		record := result[12+i*16 : 28+i*16]
		binary.BigEndian.PutUint32(record[:4], table.tag)
		binary.BigEndian.PutUint32(record[8:12], uint32(offset))
		binary.BigEndian.PutUint32(record[12:16], uint32(len(table.data)))
		copy(result[offset:], table.data)
		if table.tag == 0x68656164 && len(table.data) >= 12 {
			headOffset = offset
			clear(result[offset+8 : offset+12])
		}
		paddedLength := (len(table.data) + 3) &^ 3
		binary.BigEndian.PutUint32(record[4:8], zineFontChecksum(result[offset:offset+paddedLength]))
		offset += paddedLength
	}
	if headOffset < 0 {
		return nil, fmt.Errorf("font has no valid head table")
	}
	binary.BigEndian.PutUint32(result[headOffset+8:headOffset+12], 0xb1b0afba-zineFontChecksum(result))
	if _, err := sfnt.Parse(result); err != nil {
		return nil, fmt.Errorf("validate standalone font: %w", err)
	}
	return result, nil
}

func zineFontChecksum(data []byte) uint32 {
	var sum uint32
	for offset := 0; offset+4 <= len(data); offset += 4 {
		sum += binary.BigEndian.Uint32(data[offset : offset+4])
	}
	return sum
}
