import { useId, useRef, useState } from 'react';
import { ImagePlus, Loader2, Upload } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { t } from '../lib/i18n';

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

interface Props {
  /** The address the product uses right now. */
  value: string;
  /** Called with the address of the picture that was uploaded. */
  onChange: (url: string) => void;
  /** 'product' or 'category': the folder the picture is filed under. */
  folder?: 'product' | 'category';
  label?: string;
  hint?: string;
  error?: string;
  /** Shown under the preview, for example the address of the picture. */
  className?: string;
}

/**
 * Lets an administrator put a photo on a product or a category. The file is
 * sent to the API, which checks it, puts it in storage and hands back the
 * public address; the caller stores that address on the record.
 */
export default function ProductImagePicker({
  value,
  onChange,
  folder = 'product',
  label,
  hint,
  error,
  className = '',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const inputId = useId();

  const upload = async (file: File) => {
    setFailure(null);
    if (!ACCEPTED.includes(file.type)) {
      setFailure(t('Use a JPEG, PNG, WebP or AVIF picture.'));
      return;
    }
    if (file.size > MAX_BYTES) {
      setFailure(t('The picture is larger than 2 MB. Please choose a smaller one.'));
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api<{ url: string }>(`/api/uploads?folder=${folder}`, {
        method: 'POST',
        form,
      });
      onChange(result.url);
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-ink">
          {label}
        </label>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-paper-deep">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-6 w-6 text-muted" aria-hidden="true" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="h-4 w-4" aria-hidden="true" />
            )}
            {busy ? t('Uploading…') : t('Upload a photo')}
          </button>
          {hint && <p className="mt-1.5 text-sm text-muted">{hint}</p>}
        </div>
      </div>

      {failure && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {failure}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
