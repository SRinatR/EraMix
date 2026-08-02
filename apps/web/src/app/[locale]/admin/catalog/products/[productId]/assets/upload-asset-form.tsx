'use client';

import { useRouter } from '@/i18n/navigation';
import { SUPPORTED_LOCALES, type LocaleCode } from '@eramix/domain';
import { useState, type FormEvent } from 'react';

export function UploadAssetForm({ productId }: { readonly productId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | undefined>();
  const [displayName, setDisplayName] = useState('');
  const [locale, setLocale] = useState<LocaleCode | ''>('');
  const [altText, setAltText] = useState('');
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!file) {
      setError('Choose a file first.');
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const formData = new FormData();
      formData.set('file', file);
      if (displayName) formData.set('displayName', displayName);
      if (locale) formData.set('locale', locale);
      if (altText) formData.set('altText', altText);
      if (caption) formData.set('caption', caption);

      const response = await fetch(`/api/admin/products/${productId}/assets`, {
        method: 'POST',
        body: formData,
      });
      const body = (await response.json()) as { detail?: string; title?: string };
      if (!response.ok) {
        setError(body.detail ?? body.title ?? 'Failed to upload the file.');
        return;
      }
      setFile(undefined);
      setDisplayName('');
      setAltText('');
      setCaption('');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <label>
        File (jpeg/png/webp/pdf, up to 10 MB)
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(event) => setFile(event.target.files?.[0])}
          required
        />
      </label>
      <label>
        Display name (optional — defaults to the filename)
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      </label>
      <label>
        Locale (optional — leave blank if locale-independent)
        <select
          value={locale}
          onChange={(event) => setLocale(event.target.value as LocaleCode | '')}
        >
          <option value="">(any locale)</option>
          {SUPPORTED_LOCALES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>
      <label>
        Alt text (required before an image can be published)
        <input value={altText} onChange={(event) => setAltText(event.target.value)} />
      </label>
      <label>
        Caption
        <input value={caption} onChange={(event) => setCaption(event.target.value)} />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? 'Uploading…' : 'Upload'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
