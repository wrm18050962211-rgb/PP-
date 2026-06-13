import { ArrowLeft, Building2, CheckCircle2, Landmark, MapPinned, Navigation, Save, Store, TrainFront } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppData } from '../../app/useAppData';
import { Chip } from '../../components/Chip';
import type { CompanionApplication } from '../../types/domain';

type CityServiceOptions = {
  businessDistricts: string[];
  streets: string[];
  attractions: string[];
  metroStations: string[];
};

const cityOptions = ['上海', '北京', '广州', '深圳', '杭州', '成都', '南京', '苏州'];

const cityServiceOptions: Record<string, CityServiceOptions> = {
  上海: {
    businessDistricts: ['徐家汇', '静安寺', '新天地', '外滩', '南京西路', '淮海中路', '陆家嘴', '人民广场'],
    streets: ['武康路', '安福路', '巨鹿路', '衡山路', '陕西南路', '永康路', '愚园路', '甜爱路'],
    attractions: ['外滩', '豫园', '上海博物馆', '苏州河', '思南公馆', '上海当代艺术博物馆', '北外滩', '西岸美术馆'],
    metroStations: ['静安寺站', '陕西南路站', '南京西路站', '徐家汇站', '人民广场站', '陆家嘴站', '新天地站', '武康大楼附近'],
  },
  北京: {
    businessDistricts: ['三里屯', '国贸', '五道口', '西单', '王府井', '合生汇', '朝阳大悦城', '蓝色港湾'],
    streets: ['五道营胡同', '杨梅竹斜街', '烟袋斜街', '南锣鼓巷', '国子监街', '亮马桥路'],
    attractions: ['故宫', '天坛', '景山公园', '颐和园', '北海公园', '798艺术区', '红砖美术馆', '首钢园'],
    metroStations: ['三里屯附近', '国贸站', '东四十条站', '雍和宫站', '西单站', '王府井站', '五道口站', '望京站'],
  },
  广州: {
    businessDistricts: ['天河城', '珠江新城', '北京路', '上下九', '太古汇', 'K11', '东山口', '琶醍'],
    streets: ['东山口', '永庆坊', '沙面', '恩宁路', '庙前西街', '华侨新村'],
    attractions: ['广州塔', '沙面岛', '陈家祠', '广东省博物馆', '海心沙', '白云山', '永庆坊', '大佛寺'],
    metroStations: ['体育西路站', '珠江新城站', '东山口站', '北京路站', '公园前站', '客村站', '广州塔站', '黄沙站'],
  },
  深圳: {
    businessDistricts: ['万象天地', '海岸城', '福田中心区', '卓悦中心', '欢乐海岸', '壹方城', '蛇口', '华强北'],
    streets: ['蛇口老街', '华侨城创意园', '南头古城', '深业上城', '海上世界', '大鹏所城'],
    attractions: ['深圳湾公园', '莲花山公园', '大梅沙', '人才公园', '深圳当代艺术馆', '南头古城', '海上世界', '甘坑古镇'],
    metroStations: ['世界之窗站', '购物公园站', '后海站', '海上世界站', '高新园站', '岗厦北站', '老街站', '会展中心站'],
  },
  杭州: {
    businessDistricts: ['湖滨银泰', '武林广场', '嘉里中心', '钱江新城', '滨江宝龙城', '城西银泰', '西溪印象城', '良渚玉鸟集'],
    streets: ['北山街', '南山路', '小河直街', '大兜路', '青芝坞', '十五奎巷'],
    attractions: ['西湖', '灵隐寺', '良渚文化村', '中国美院象山', '西溪湿地', '京杭大运河', '法喜寺', '湘湖'],
    metroStations: ['龙翔桥站', '凤起路站', '武林广场站', '钱江路站', '江陵路站', '文泽路站', '良渚站', '西湖文化广场站'],
  },
  成都: {
    businessDistricts: ['太古里', '春熙路', 'IFS', '宽窄巷子', '玉林', '建设路', '金融城', '东郊记忆'],
    streets: ['镋钯街', '玉林路', '芳草街', '泡桐树街', '祠堂街', '奎星楼街'],
    attractions: ['宽窄巷子', '锦里', '杜甫草堂', '东郊记忆', '成都博物馆', '天府艺术公园', '望江楼', '人民公园'],
    metroStations: ['春熙路站', '太古里附近', '省体育馆站', '宽窄巷子站', '金融城站', '建设北路站', '中医大省医院站', '东大路站'],
  },
  南京: {
    businessDistricts: ['新街口', '德基广场', '河西金鹰', '夫子庙', '老门东', '鼓楼', '百家湖', '仙林金鹰'],
    streets: ['颐和路', '上海路', '陶谷新村', '老门东', '熙南里', '南台巷'],
    attractions: ['玄武湖', '夫子庙', '中山陵', '南京博物院', '老门东', '明孝陵', '鸡鸣寺', '总统府'],
    metroStations: ['新街口站', '大行宫站', '鼓楼站', '夫子庙站', '玄武门站', '鸡鸣寺站', '元通站', '百家湖站'],
  },
  苏州: {
    businessDistricts: ['观前街', '平江路', '金鸡湖', '圆融时代广场', '苏州中心', '山塘街', '诚品生活', '十全街'],
    streets: ['平江路', '山塘街', '十全街', '葑门横街', '西中市', '双塔市集'],
    attractions: ['拙政园', '苏州博物馆', '金鸡湖', '虎丘', '留园', '网师园', '诚品书店', '同里古镇'],
    metroStations: ['东方之门站', '临顿路站', '察院场站', '山塘街站', '苏州火车站', '时代广场站', '北寺塔站', '南门站'],
  },
};

const acceptedScenes = ['户外街拍', 'Citywalk', '商圈逛街', '餐厅探店', '咖啡店', '展览', '美术馆', '夜景散步', '景点旅行', '室内空间'];
const rejectedScenes = ['不接受户外', '不接受夜间', '不接受偏远地点', '不接受私密空间', '仅限商圈和餐厅'];

export function ServiceRangeSettings() {
  const { application, saveApplication } = useAppData();
  const [savedVisible, setSavedVisible] = useState(false);
  const options = cityServiceOptions[application.city] ?? cityServiceOptions.上海;

  const selectedLocationCount = application.areas.length + safeList(application.streets).length + safeList(application.attractions).length + safeList(application.metroStations).length;
  const scopeSummary = useMemo(() => {
    const city = application.city || '未设置城市';
    const radius = `${application.serviceRadiusKm ?? 5}km`;
    return `${city} · ${selectedLocationCount} 个地点 · ${radius}`;
  }, [application.city, application.serviceRadiusKm, selectedLocationCount]);

  function setCity(city: string) {
    saveApplication({
      city,
      areas: [],
      streets: [],
      attractions: [],
      metroStations: [],
    });
  }

  function toggleList(field: 'areas' | 'streets' | 'attractions' | 'metroStations' | 'services' | 'rejectedServices', item: string) {
    const current = safeList(application[field]);
    const next = current.includes(item) ? current.filter((value) => value !== item) : [...current, item];
    saveApplication({ [field]: next });
  }

  function saveRange() {
    saveApplication({ updatedAt: new Date().toISOString() });
    setSavedVisible(true);
    window.setTimeout(() => setSavedVisible(false), 1600);
  }

  return (
    <div className="pb-28">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-100 bg-white/95 px-4 py-4 backdrop-blur">
        <Link to="/companion/mine" className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100" aria-label="返回">
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">服务范围</h1>
          <p className="mt-0.5 text-xs text-zinc-500">先设置 base 城市，再设置最大服务公里数和可接地点</p>
        </div>
      </header>

      <main className="px-4 py-5">
        <section className="rounded-[10px] bg-zinc-950 p-4 text-white">
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-white/10">
              <MapPinned size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white/65">当前可服务范围</p>
              <h2 className="mt-1 text-2xl font-bold">{scopeSummary}</h2>
              <p className="mt-2 text-sm leading-6 text-white/70">MVP 先用城市、可接地点和最大公里数建立接单边界，地图圈选后续接入。</p>
            </div>
          </div>
        </section>

        <FormSection title="1. Base 城市">
          <div className="grid grid-cols-4 gap-2">
            {cityOptions.map((city) => (
              <button
                key={city}
                className={`h-11 rounded-full text-sm font-bold ${application.city === city ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-700'}`}
                onClick={() => setCity(city)}
              >
                {city}
              </button>
            ))}
          </div>
        </FormSection>

        <LocationSection icon={Building2} title="2. 可服务商圈" items={options.businessDistricts} selected={application.areas} onToggle={(item) => toggleList('areas', item)} />
        <LocationSection icon={Store} title="3. 可接受地点补充" items={options.streets} selected={safeList(application.streets)} onToggle={(item) => toggleList('streets', item)} />
        <LocationSection icon={Landmark} title="4. 可服务景点" items={options.attractions} selected={safeList(application.attractions)} onToggle={(item) => toggleList('attractions', item)} />
        <LocationSection icon={TrainFront} title="5. 可服务地铁站附近" items={options.metroStations} selected={safeList(application.metroStations)} onToggle={(item) => toggleList('metroStations', item)} />

        <FormSection title="6. 可接受最大公里数">
          <div className="rounded-[10px] border border-zinc-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-rose-50 text-rose-600">
                <Navigation size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">从选定地点周边 {application.serviceRadiusKm ?? 5}km 内可接单</p>
                <p className="mt-0.5 text-xs text-zinc-500">用于先给用户一个明确预期，精确地图范围后续补齐</p>
              </div>
            </div>
            <input
              className="mt-4 w-full accent-rose-500"
              type="range"
              min="1"
              max="20"
              value={application.serviceRadiusKm ?? 5}
              onChange={(event) => saveApplication({ serviceRadiusKm: Number(event.target.value) })}
            />
            <div className="mt-2 flex justify-between text-xs font-medium text-zinc-400">
              <span>1km</span>
              <span>10km</span>
              <span>20km</span>
            </div>
          </div>
        </FormSection>

        <ChoiceSection title="7. 可接受场景" items={acceptedScenes} selected={application.services} onToggle={(item) => toggleList('services', item)} />
        <ChoiceSection title="8. 不接受场景" items={rejectedScenes} selected={safeList(application.rejectedServices)} onToggle={(item) => toggleList('rejectedServices', item)} tone="warn" />
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-zinc-100 bg-white/95 px-4 py-3 backdrop-blur">
        {savedVisible && (
          <div className="mb-2 flex items-center justify-center gap-2 rounded-full bg-emerald-50 py-2 text-xs font-bold text-emerald-700">
            <CheckCircle2 size={15} />
            服务范围已保存
          </div>
        )}
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-rose-500 text-sm font-bold text-white" onClick={saveRange}>
          <Save size={18} />
          保存服务范围
        </button>
      </div>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-base font-bold">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function LocationSection({
  icon: Icon,
  title,
  items,
  selected,
  onToggle,
}: {
  icon: React.ElementType;
  title: string;
  items: string[];
  selected: string[];
  onToggle: (item: string) => void;
}) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="text-rose-500" size={18} />
        <h2 className="text-base font-bold">{title}</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button key={item} onClick={() => onToggle(item)}>
            <Chip active={selected.includes(item)}>{item}</Chip>
          </button>
        ))}
      </div>
    </section>
  );
}

function ChoiceSection({
  title,
  items,
  selected,
  onToggle,
  tone = 'default',
}: {
  title: string;
  items: string[];
  selected: string[];
  onToggle: (item: string) => void;
  tone?: 'default' | 'warn';
}) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-base font-bold">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const active = selected.includes(item);
          return (
            <button key={item} onClick={() => onToggle(item)}>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium ${
                  active ? (tone === 'warn' ? 'bg-amber-600 text-white' : 'bg-zinc-950 text-white') : 'bg-zinc-100 text-zinc-700'
                }`}
              >
                {item}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function safeList(value: CompanionApplication[keyof CompanionApplication]) {
  return Array.isArray(value) ? value : [];
}
