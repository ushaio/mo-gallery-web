import type { PlazaSlot, PlazaTemplate } from './plaza'
import type { ZinePageOrientation, ZinePageSize } from './types'

export interface BuiltinPlazaTemplate extends Pick<PlazaTemplate, 'id' | 'title' | 'description' | 'layout' | 'pageLayout'> {
  pageSize: Exclude<ZinePageSize, 'custom'>
  pageOrientation: ZinePageOrientation
}

type TextStyle = Partial<Pick<PlazaSlot, 'align' | 'color' | 'fontFamily' | 'lineHeight' | 'rotation' | 'verticalAlign'>>

function image(page: PlazaSlot['page'], x: number, y: number, w: number, h: number, rotation = 0): PlazaSlot {
  return { kind: 'image', page, x, y, w, h, rotation, zIndex: 1 }
}

function text(
  page: PlazaSlot['page'], x: number, y: number, w: number, h: number,
  content: string, fontSize: number, style: TextStyle = {},
): PlazaSlot {
  return {
    kind: 'text', page, x, y, w, h, content, fontSize,
    zIndex: 2, rotation: 0, align: 'left', verticalAlign: 'top',
    fontFamily: 'serif', lineHeight: 1.3, color: '#24221f',
    ...style,
  }
}

/** Fresh, editable layouts in page-relative units; no assets or remote metadata. */
export function getBuiltinPlazaTemplates(language: 'zh' | 'en'): BuiltinPlazaTemplate[] {
  const copy = (zh: string, en: string) => language === 'zh' ? zh : en
  const smallPrint: TextStyle = { fontFamily: 'monospace', color: '#706b63' }

  const contactFrames = (page: PlazaSlot['page'], offset: number): PlazaSlot[] => {
    const captions = language === 'zh'
      ? ['晨光', '窗边', '转角', '树影', '过客', '回望', '午后', '屋顶', '晚风', '归途', '灯火', '余光']
      : ['DAWN', 'WINDOW', 'CORNER', 'SHADOW', 'PASSERBY', 'GLANCE', 'NOON', 'ROOFTOP', 'BREEZE', 'HOMEWARD', 'LIGHTS', 'AFTERGLOW']

    return Array.from({ length: 6 }, (_, index) => {
      const x = index % 2 === 0 ? 0.075 : 0.52
      const y = 0.2 + Math.floor(index / 2) * 0.225
      const number = String(offset + index + 1).padStart(2, '0')
      return [
        image(page, x, y, 0.405, 0.175),
        text(page, x, y + 0.185, 0.405, 0.035, `${number} / ${captions[offset + index]}`, 0.013, smallPrint),
      ]
    }).flat()
  }

  return [
    {
      id: 'builtin-zine-field-notes',
      title: copy('漫游手记', 'Field Notes'),
      description: copy('大字标题、错落照片与路上短句，把一次散步编成手记。', 'An unhurried photo journal with oversized type, offset frames, and notes from the road.'),
      pageLayout: 'text-photo',
      pageSize: 'a5',
      pageOrientation: 'portrait',
      layout: {
        slots: [
          text('left', 0.075, 0.075, 0.85, 0.045, copy('步行记录 / 01', 'ON FOOT / 01'), 0.014, smallPrint),
          text('left', 0.075, 0.17, 0.85, 0.245, copy('漫游\n手记', 'Field\nnotes.'), 0.095, { lineHeight: 1.04 }),
          text('left', 0.075, 0.465, 0.85, 0.105, copy('沿着小路，\n把日常收进镜头。', 'Follow a small road.\nCollect the everyday.'), 0.02, { lineHeight: 1.55 }),
          image('left', 0.075, 0.65, 0.49, 0.225),
          text('left', 0.61, 0.765, 0.315, 0.105, copy('01 /\n路边的光', '01 /\nWayside light'), 0.014, smallPrint),
          image('right', 0.085, 0.08, 0.835, 0.63),
          text('right', 0.085, 0.745, 0.835, 0.045, copy('02 / 午后漫行', '02 / AFTERNOON WALK'), 0.014, smallPrint),
          text('right', 0.085, 0.825, 0.835, 0.1, copy('没有目的地，\n只有下一束光。', 'No destination.\nJust the next patch of light.'), 0.02, { lineHeight: 1.55 }),
        ],
      },
    },
    {
      id: 'builtin-zine-urban-rhythm',
      title: copy('城市切片', 'Urban Rhythm'),
      description: copy('高低交错的竖幅与醒目标题，收集街角、建筑和城市节奏。', 'Staggered vertical frames and graphic typography for architecture, street scenes, and city rhythms.'),
      pageLayout: 'two-up',
      pageSize: 'b5',
      pageOrientation: 'portrait',
      layout: {
        slots: [
          text('left', 0.075, 0.07, 0.85, 0.04, copy('城市观察 / 01', 'URBAN STUDIES / 01'), 0.013, smallPrint),
          text('left', 0.075, 0.14, 0.85, 0.215, copy('城市\n切片', 'CITY\nCUTS'), 0.088, { fontFamily: 'sans-serif', lineHeight: 1.05 }),
          image('left', 0.075, 0.43, 0.24, 0.37),
          image('left', 0.36, 0.39, 0.24, 0.49),
          image('left', 0.645, 0.52, 0.28, 0.36),
          text('left', 0.075, 0.91, 0.85, 0.04, copy('街角 / 立面 / 经过', 'CORNERS / LINES / PASSERSBY'), 0.013, smallPrint),
          image('right', 0.075, 0.08, 0.85, 0.46),
          text('right', 0.075, 0.59, 0.85, 0.135, copy('在缝隙里\n读一座城。', 'Between\nthe lines.'), 0.04, { fontFamily: 'sans-serif', lineHeight: 1.25 }),
          text('right', 0.075, 0.805, 0.39, 0.1, copy('光\n影\n日常', 'LIGHT\nLINES\nEVERYDAY'), 0.014, smallPrint),
          image('right', 0.53, 0.765, 0.395, 0.14),
        ],
      },
    },
    {
      id: 'builtin-zine-contact-archive',
      title: copy('银盐档案', 'Contact Archive'),
      description: copy('十二格联系表与逐帧编号，让一卷照片成为值得回看的档案。', 'A twelve-frame contact sheet with numbered captions, made for film rolls and visual collections.'),
      pageLayout: 'two-up',
      pageSize: 'square',
      pageOrientation: 'portrait',
      layout: {
        slots: [
          text('left', 0.075, 0.065, 0.85, 0.08, copy('银盐档案', 'Contact archive.'), 0.045),
          text('right', 0.075, 0.08, 0.85, 0.055, copy('逐帧索引 / 07—12', 'FRAME INDEX / 07—12'), 0.018, smallPrint),
          ...contactFrames('left', 0),
          ...contactFrames('right', 6),
          text('left', 0.075, 0.91, 0.85, 0.04, copy('一卷胶片，十二个片刻。', 'One roll. Twelve moments.'), 0.014, smallPrint),
          text('right', 0.075, 0.91, 0.85, 0.04, copy('观察 / 整理 / 再看一次', 'Observe. Collect. Look again.'), 0.014, smallPrint),
        ],
      },
    },
    {
      id: 'builtin-zine-quiet-poetry',
      title: copy('留白诗页', 'Quiet Poetry'),
      description: copy('一张小照片与几行诗句，让大面积留白成为叙事的一部分。', 'A single small photograph, a few lines of poetry, and generous space to pause.'),
      pageLayout: 'text-photo',
      pageSize: 'a5',
      pageOrientation: 'portrait',
      layout: {
        slots: [
          text('left', 0.09, 0.08, 0.82, 0.04, copy('04 / 静', '04 / STILL'), 0.013, smallPrint),
          image('left', 0.27, 0.24, 0.46, 0.23),
          text('left', 0.27, 0.495, 0.46, 0.045, copy('一帧，足矣。', 'A quiet frame.'), 0.014, { ...smallPrint, align: 'center' }),
          text('left', 0.09, 0.76, 0.82, 0.11, copy('停。', 'Pause.'), 0.05),
          text('right', 0.16, 0.19, 0.74, 0.175, copy('留白\n之间', 'In the\nquiet.'), 0.065, { lineHeight: 1.15 }),
          text('right', 0.16, 0.465, 0.74, 0.19, copy('把声音放轻。\n让光落下来。\n这一页，\n留给片刻的安静。', 'Let the noise fade.\nLet the light in.\nA little space\nfor the passing day.'), 0.02, { lineHeight: 1.8 }),
          text('right', 0.16, 0.855, 0.74, 0.055, copy('某日 / 某处', 'SOMEWHERE / SOMEDAY'), 0.013, smallPrint),
        ],
      },
    },
    {
      id: 'builtin-zine-postcards',
      title: copy('旅途来信', 'Postcards'),
      description: copy('微微倾斜的明信片照片、邮票小框与寄给远方的旅行短笺。', 'Tilted postcard frames, a small photo stamp, and personal notes sent from the road.'),
      pageLayout: 'text-photo',
      pageSize: 'a5',
      pageOrientation: 'landscape',
      layout: {
        slots: [
          text('left', 0.08, 0.075, 0.84, 0.085, copy('寄往远方', 'Postcards'), 0.044),
          image('left', 0.14, 0.23, 0.72, 0.36, -5),
          text('left', 0.14, 0.645, 0.72, 0.065, copy('某个午后，海风经过。', 'A postcard from the coast.'), 0.023, { align: 'center', rotation: -5, color: '#785c49' }),
          text('left', 0.14, 0.8, 0.72, 0.11, copy('亲爱的朋友：\n这里的风，与你分享。', 'Dear friend,\nI saved a little light for you.'), 0.016, { lineHeight: 1.6 }),
          text('right', 0.12, 0.085, 0.76, 0.05, copy('正在途中 / 02', 'SENT ALONG THE WAY / 02'), 0.014, smallPrint),
          image('right', 0.17, 0.23, 0.65, 0.36, 6),
          text('right', 0.17, 0.645, 0.65, 0.065, copy('下一站，见。', 'See you down the road.'), 0.025, { align: 'center', rotation: 6, color: '#785c49' }),
          text('right', 0.12, 0.825, 0.58, 0.085, copy('地址：世界的一角', 'To: a corner of the world'), 0.014, smallPrint),
          image('right', 0.775, 0.805, 0.1, 0.095, 6),
        ],
      },
    },
    {
      id: 'builtin-zine-horizon',
      title: copy('地平线', 'Horizon'),
      description: copy('贯穿双页的全景照片与两侧短句，为山海、远景和开阔视野留出空间。', 'One panoramic photograph across the spread, framed by quiet type and an open horizon.'),
      pageLayout: 'single',
      pageSize: 'b5',
      pageOrientation: 'portrait',
      layout: {
        slots: [
          text('left', 0.08, 0.085, 0.84, 0.14, copy('地平线', 'Horizon'), 0.075),
          text('right', 0.1, 0.105, 0.82, 0.1, copy('让视线\n走得更远。', 'Let the eye\ntravel a little further.'), 0.019, { align: 'right', lineHeight: 1.6 }),
          // A single editable frame continues across the gutter, with outer margins.
          image('left', 0.08, 0.31, 1.84, 0.43),
          text('left', 0.08, 0.785, 0.84, 0.05, copy('01 / 在天地之间', '01 / BETWEEN LAND AND SKY'), 0.014, smallPrint),
          text('right', 0.14, 0.815, 0.78, 0.1, copy('抵达之前，\n先看见远方。', 'Before arriving,\nlook into the distance.'), 0.023, { align: 'right', lineHeight: 1.45 }),
          text('left', 0.08, 0.915, 0.84, 0.04, copy('一条线，连接此刻与远方。', 'A line between here and elsewhere.'), 0.013, smallPrint),
        ],
      },
    },
  ]
}
