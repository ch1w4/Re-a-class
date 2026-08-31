'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Color } from '@tiptap/extension-color';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { FontSize, NonInclusiveBold, NonInclusiveTextStyle, NonInclusiveUnderline, NoteImage, normalizeStudentNoteHtml } from './studentNoteExtensions';

const FONT_SIZES = [
  { label: '小', value: '12px' },
  { label: '標準', value: '14px' },
  { label: '大', value: '18px' },
  { label: '特大', value: '24px' },
] as const;

const TEXT_COLORS = [
  { label: '黒', value: '#111827' },
  { label: '赤', value: '#dc2626' },
  { label: '青', value: '#2563eb' },
  { label: '緑', value: '#16a34a' },
  { label: 'オレンジ', value: '#ea580c' },
  { label: '紫', value: '#9333ea' },
] as const;

interface Props { roomId: string; initialHtml: string; }

export function StudentNoteEditor({ roomId, initialHtml }: Props) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestHtmlRef = useRef('');
  const savedHtmlRef = useRef('');
  const savingRef = useRef<Promise<void> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasDrawingRef = useRef(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [showHandwriting, setShowHandwriting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedColor, setSelectedColor] = useState('#111827');

  const saveLatest = useCallback(async () => {
    if (savingRef.current) return savingRef.current;
    const drain = async () => {
      while (latestHtmlRef.current !== savedHtmlRef.current) {
        const html = latestHtmlRef.current;
        setSaveState('saving');
        const response = await fetch(`/api/rooms/${roomId}/student-note`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: html }),
        });
        if (!response.ok) { setSaveState('error'); return; }
        savedHtmlRef.current = html;
      }
      setSaveState('saved');
    };
    savingRef.current = drain().finally(() => { savingRef.current = null; });
    return savingRef.current;
  }, [roomId]);

  const scheduleSave = useCallback((html: string) => {
    latestHtmlRef.current = html;
    setSaveState('idle');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void saveLatest(), 700);
  }, [saveLatest]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ bold: false }),
      NonInclusiveBold,
      NonInclusiveUnderline,
      NonInclusiveTextStyle,
      Color,
      FontSize,
      NoteImage,
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'min-h-80 w-full px-4 py-3 text-sm text-gray-700 focus:outline-none [&_p]:my-0 [&_p]:leading-[1.4] [&_span]:leading-[1.4]',
        spellcheck: 'false',
      },
      handleClick: (view, position) => {
        const resolved = view.state.doc.resolve(position);
        const before = resolved.nodeBefore;
        const after = resolved.nodeAfter;
        const isFormatBoundary = before?.isText && (!after?.isText || !before.sameMarkup(after));
        if (!isFormatBoundary) return false;

        const textStyle = view.state.schema.marks.textStyle;
        const marks = textStyle ? [textStyle.create({ color: '#111827', fontSize: '14px' })] : [];
        view.dispatch(view.state.tr.setStoredMarks(marks));
        setSelectedColor('#111827');
        return false;
      },
      handleKeyDown: (view, event) => {
        if (event.key !== 'Enter') return false;
        setSelectedColor('#111827');
        setTimeout(() => {
          const textStyle = view.state.schema.marks.textStyle;
          if (!textStyle) return;
          const currentMarks = view.state.storedMarks ?? view.state.selection.$from.marks();
          const existingStyle = currentMarks.find((mark) => mark.type === textStyle);
          const nextStyle = textStyle.create({ ...existingStyle?.attrs, color: '#111827' });
          // 改行後は色に加えて太字・下線も解除する。文字サイズだけは維持する。
          view.dispatch(view.state.tr.setStoredMarks([nextStyle]));
        }, 0);
        return false;
      },
    },
    onUpdate: ({ editor: instance }) => scheduleSave(instance.getHTML()),
    onSelectionUpdate: ({ editor: instance }) => {
      setSelectedColor(String(instance.getAttributes('textStyle').color || '#111827').toLowerCase());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const html = normalizeStudentNoteHtml(initialHtml);
    editor.commands.setContent(html, false);
    latestHtmlRef.current = editor.getHTML();
    savedHtmlRef.current = editor.getHTML();
  }, [editor, initialHtml]);

  useEffect(() => {
    const flush = () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (latestHtmlRef.current !== savedHtmlRef.current) void saveLatest();
    };
    window.addEventListener('beforeunload', flush);
    return () => { window.removeEventListener('beforeunload', flush); flush(); };
  }, [saveLatest]);

  const resetCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#fff'; context.fillRect(0, 0, rect.width, rect.height);
    context.strokeStyle = '#111827'; context.lineWidth = 3; context.lineCap = 'round'; context.lineJoin = 'round';
    hasDrawingRef.current = false;
  }, []);

  useEffect(() => {
    if (!showHandwriting) return;
    const frame = requestAnimationFrame(resetCanvas);
    return () => cancelAnimationFrame(frame);
  }, [showHandwriting, resetCanvas]);

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const startDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const context = event.currentTarget.getContext('2d'); if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId); drawingRef.current = true; hasDrawingRef.current = true;
    const current = point(event); context.beginPath(); context.moveTo(current.x, current.y);
  };
  const moveDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return; const context = event.currentTarget.getContext('2d'); if (!context) return;
    const current = point(event); context.lineTo(current.x, current.y); context.stroke();
  };
  const endDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const insertHandwriting = async () => {
    if (!editor || !canvasRef.current || uploading) return;
    if (!hasDrawingRef.current) { setMessage('手書きしてから追加してください'); return; }
    setUploading(true); setMessage('');
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvasRef.current!.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error();
      const data = new FormData(); data.append('image', new File([blob], 'handwriting.png', { type: 'image/png' }));
      const response = await fetch(`/api/rooms/${roomId}/student-note/images`, { method: 'POST', body: data });
      if (!response.ok) throw new Error();
      const image = await response.json();
      editor.chain().focus().setImage({ src: image.url, alt: '手書きメモ' }).run();
      setShowHandwriting(false);
    } catch { setMessage('手書き画像の保存に失敗しました'); }
    finally { setUploading(false); }
  };

  const deleteImage = async () => {
    if (!editor || !editor.isActive('image')) return;
    const src = String(editor.getAttributes('image').src || '');
    const id = src.match(/^\/api\/student-note-images\/([^/?#]+)/)?.[1];
    if (id) {
      const response = await fetch(`/api/student-note-images/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) { setMessage('画像ファイルの削除に失敗しました'); return; }
    }
    editor.chain().focus().deleteSelection().run();
  };

  if (!editor) return <div className="min-h-80 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />;
  const textStyle = editor.getAttributes('textStyle');
  const currentSize = textStyle.fontSize || '14px';
  const isKnownColor = TEXT_COLORS.some((color) => color.value === selectedColor);
  const imageSelected = editor.isActive('image');
  const toggleMark = (name: 'bold' | 'underline') => {
    const stored = editor.state.storedMarks?.some((mark) => mark.type.name === name) ?? false;
    const immediatelyBefore = editor.state.selection.empty
      && editor.state.selection.$from.nodeBefore?.marks.some((mark) => mark.type.name === name);
    const shouldDisable = editor.isActive(name) || stored || immediatelyBefore;
    const chain = editor.chain().focus();
    if (shouldDisable) chain.unsetMark(name).run();
    else chain.setMark(name).run();
  };

  return <>
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
      <button type="button" onClick={() => toggleMark('bold')} aria-pressed={editor.isActive('bold')} className={`rounded-lg border px-2 py-1 text-sm font-bold ${editor.isActive('bold') ? 'border-teal-400 bg-teal-100 text-teal-700' : 'border-gray-200 bg-white text-gray-700'}`}>B</button>
      <button type="button" onClick={() => toggleMark('underline')} aria-pressed={editor.isActive('underline')} className={`rounded-lg border px-2 py-1 text-sm font-semibold underline ${editor.isActive('underline') ? 'border-teal-400 bg-teal-100 text-teal-700' : 'border-gray-200 bg-white text-gray-700'}`}>U</button>
      <select value={currentSize} onChange={(event) => editor.chain().focus().setFontSize(event.target.value).run()} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700">
        {FONT_SIZES.map((size) => <option key={size.value} value={size.value}>{size.label}</option>)}
      </select>
      <select
        value={selectedColor}
        onChange={(event) => {
          setSelectedColor(event.target.value);
          editor.chain().focus().setColor(event.target.value).run();
        }}
        aria-label="文字色"
        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700"
        style={{ color: selectedColor }}
      >
        {!isKnownColor && <option value={selectedColor} style={{ color: selectedColor }}>色：現在の色</option>}
        {TEXT_COLORS.map((color) => <option key={color.value} value={color.value} style={{ color: color.value }}>色：{color.label}</option>)}
      </select>
      <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().setFontSize('14px').setColor('#111827').run()} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-semibold text-gray-700">書式解除</button>
      <button type="button" onClick={() => setShowHandwriting(true)} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-semibold text-gray-700">手書き</button>
    </div>
    {imageSelected && <div className="mb-2 flex flex-wrap gap-2 rounded-xl border border-teal-200 bg-teal-50 p-2">
      {(['40%', '70%', '100%'] as const).map((width, index) => <button key={width} type="button" onClick={() => editor.chain().focus().updateAttributes('image', { width }).run()} className="rounded border border-teal-200 bg-white px-2 py-1 text-xs text-teal-700">{['小', '中', '大'][index]}</button>)}
      {(['left', 'center', 'right'] as const).map((align) => <button key={align} type="button" onClick={() => editor.chain().focus().updateAttributes('image', { align }).run()} className="rounded border border-teal-200 bg-white px-2 py-1 text-xs text-teal-700">{{ left: '左', center: '中央', right: '右' }[align]}</button>)}
      <button type="button" onClick={deleteImage} className="rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-600">削除</button>
    </div>}
    <EditorContent editor={editor} onBlur={() => void saveLatest()} className="overflow-y-auto rounded-xl border border-gray-200 focus-within:ring-2 focus-within:ring-teal-400" />
    <p className={`mt-2 text-xs ${saveState === 'error' ? 'text-red-500' : 'text-gray-400'}`}>{saveState === 'saving' ? '保存中...' : saveState === 'saved' ? '保存しました' : saveState === 'error' ? '保存に失敗しました。入力内容は画面に保持されています' : 'サーバーに自動保存されます'}</p>
    {message && <p className="mt-1 text-xs text-red-500">{message}</p>}
    {showHandwriting && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl">
      <div className="mb-3 flex justify-between"><h3 className="font-bold text-gray-700">手書き入力</h3><button type="button" onClick={() => setShowHandwriting(false)} className="text-sm text-gray-500">閉じる</button></div>
      <canvas ref={canvasRef} onPointerDown={startDrawing} onPointerMove={moveDrawing} onPointerUp={endDrawing} onPointerCancel={endDrawing} className="h-80 w-full cursor-crosshair rounded-xl border border-gray-200" style={{ touchAction: 'none' }} />
      <div className="mt-4 flex gap-2"><button type="button" onClick={resetCanvas} className="flex-1 rounded-xl border py-2 text-sm font-semibold">クリア</button><button type="button" disabled={uploading} onClick={insertHandwriting} className="flex-1 rounded-xl bg-teal-500 py-2 text-sm font-semibold text-white disabled:opacity-50">{uploading ? '保存中...' : 'メモへ追加'}</button></div>
    </div></div>}
  </>;
}
