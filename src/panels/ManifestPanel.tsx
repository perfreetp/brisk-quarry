import type { AudioAsset } from '../types';

interface ManifestPanelProps {
  assets: AudioAsset[];
  ambientEnabled: boolean;
  onToggleAmbient: () => void;
  onPreview: (asset: AudioAsset) => void;
}

export function ManifestPanel({ assets, ambientEnabled, onToggleAmbient, onPreview }: ManifestPanelProps) {
  const ambient = assets.filter((asset) => asset.type === 'ambient');
  const cues = assets.filter((asset) => asset.type !== 'ambient');

  return (
    <div className="manifest-panel">
      <section className="inspector-section">
        <h4>音频组环境音清单</h4>
        <p className="section-sub">已从 <code>audio-manifest.json</code> 导入；真实音频文件路径随交付 JSON 一起给出。</p>
        <button type="button" className={ambientEnabled ? 'secondary-btn active' : 'secondary-btn'} onClick={onToggleAmbient}>
          {ambientEnabled ? '■ 停止环境底噪' : '▶ 启动环境底噪'}
        </button>
        <div className="asset-list">
          {ambient.map((asset) => (
            <AssetCard key={asset.id} asset={asset} onPreview={onPreview} />
          ))}
        </div>
      </section>

      <section className="inspector-section">
        <h4>音效 / 信标清单</h4>
        <div className="asset-list">
          {cues.map((asset) => (
            <AssetCard key={asset.id} asset={asset} onPreview={onPreview} />
          ))}
        </div>
      </section>
    </div>
  );
}

function AssetCard({ asset, onPreview }: { asset: AudioAsset; onPreview: (asset: AudioAsset) => void }) {
  return (
    <article className="asset-card">
      <div className="asset-head">
        <span className={`asset-type ${asset.type}`}>{asset.type}</span>
        <strong>{asset.name}</strong>
      </div>
      <code className="asset-file">{asset.file}</code>
      <p>{asset.description}</p>
      <div className="asset-foot">
        <span className="muted">{asset.duration === 'loop' ? '循环' : `${asset.duration}s`}{asset.channels ? ` · ${asset.channels}` : ''}</span>
        <button type="button" className="mini-btn" onClick={() => onPreview(asset)}>试听合成占位</button>
      </div>
    </article>
  );
}
