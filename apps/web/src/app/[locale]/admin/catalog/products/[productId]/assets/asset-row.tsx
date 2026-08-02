'use client';

import { useRouter } from '@/i18n/navigation';
import { useState, type FormEvent } from 'react';
import { TransitionStatusForm } from '../../../transition-status-form';

export interface AssetRowData {
  readonly id: string;
  readonly assetType: string;
  readonly status: string;
  readonly displayName: string;
  readonly originalFilename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly locale?: string | undefined;
  readonly altText?: string | undefined;
  readonly caption?: string | undefined;
  readonly sortOrder: number;
  readonly malwareScanStatus: string;
  readonly malwareScanEngine: string;
  readonly version: number;
}

async function postJson(url: string, method: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function AssetRow({
  productId,
  asset,
  downloadUrl,
  orderedIds,
  index,
}: {
  readonly productId: string;
  readonly asset: AssetRowData;
  readonly downloadUrl: string;
  /** Every asset id for this product, in the current display order. */
  readonly orderedIds: readonly string[];
  readonly index: number;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(asset.displayName);
  const [altText, setAltText] = useState(asset.altText ?? '');
  const [caption, setCaption] = useState(asset.caption ?? '');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSaveMetadata(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const response = await postJson(
        `/api/admin/products/${productId}/assets/${asset.id}`,
        'PATCH',
        {
          expectedVersion: asset.version,
          displayName,
          altText: altText || null,
          caption: caption || null,
        },
      );
      const body = (await response.json()) as { detail?: string; title?: string };
      if (!response.ok) {
        setError(body.detail ?? body.title ?? 'Failed to save.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleRemove(): Promise<void> {
    if (!window.confirm(`Permanently remove "${asset.displayName}"? This cannot be undone.`)) {
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/admin/products/${productId}/assets/${asset.id}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { detail?: string; title?: string };
        setError(body.detail ?? body.title ?? 'Failed to remove.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleMove(direction: -1 | 1): Promise<void> {
    const target = index + direction;
    if (target < 0 || target >= orderedIds.length) {
      return;
    }
    const reordered = [...orderedIds];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved!);
    setPending(true);
    setError(undefined);
    try {
      const response = await postJson(`/api/admin/products/${productId}/assets/reorder`, 'PATCH', {
        orderedAssetIds: reordered,
      });
      if (!response.ok) {
        const body = (await response.json()) as { detail?: string; title?: string };
        setError(body.detail ?? body.title ?? 'Failed to reorder.');
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <tr>
      <td>
        {asset.assetType === 'IMAGE' ? (
          <img src={downloadUrl} alt={asset.altText ?? ''} width={80} />
        ) : (
          <a href={downloadUrl}>{asset.originalFilename}</a>
        )}
      </td>
      <td>{asset.assetType}</td>
      <td>{asset.status}</td>
      <td>
        {Math.round(asset.sizeBytes / 1024)} KB, {asset.malwareScanStatus} (
        {asset.malwareScanEngine})
      </td>
      <td>
        <button type="button" onClick={() => void handleMove(-1)} disabled={pending || index === 0}>
          ↑
        </button>
        <button
          type="button"
          onClick={() => void handleMove(1)}
          disabled={pending || index === orderedIds.length - 1}
        >
          ↓
        </button>
      </td>
      <td>
        <form onSubmit={(event) => void handleSaveMetadata(event)}>
          <label>
            Display name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label>
            Alt text
            <input value={altText} onChange={(event) => setAltText(event.target.value)} />
          </label>
          <label>
            Caption
            <input value={caption} onChange={(event) => setCaption(event.target.value)} />
          </label>
          <button type="submit" disabled={pending}>
            Save
          </button>
        </form>
      </td>
      <td>
        <TransitionStatusForm
          endpoint={`/api/admin/products/${productId}/assets/${asset.id}/status`}
          currentStatus={asset.status}
          expectedVersion={asset.version}
        />
      </td>
      <td>
        <button type="button" onClick={() => void handleRemove()} disabled={pending}>
          Remove
        </button>
      </td>
      {error && (
        <td>
          <p role="alert">{error}</p>
        </td>
      )}
    </tr>
  );
}
