// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { Color } from '@tiptap/extension-color';
import StarterKit from '@tiptap/starter-kit';
import { FontSize, NonInclusiveBold, NonInclusiveTextStyle, NonInclusiveUnderline, normalizeStudentNoteHtml } from './studentNoteExtensions';

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function createEditor(content = '<p>テスト</p>') {
  editor = new Editor({
    extensions: [StarterKit.configure({ bold: false }), NonInclusiveBold, NonInclusiveUnderline, NonInclusiveTextStyle, Color, FontSize],
    content,
  });
  return editor;
}

describe('生徒メモの書式', () => {
  it('太字と下線を同時に設定し、それぞれを独立して解除できる', () => {
    const instance = createEditor();
    instance.chain().setTextSelection({ from: 1, to: 4 }).toggleBold().toggleUnderline().run();
    expect(instance.isActive('bold')).toBe(true);
    expect(instance.isActive('underline')).toBe(true);

    instance.chain().toggleBold().run();
    expect(instance.isActive('bold')).toBe(false);
    expect(instance.isActive('underline')).toBe(true);

    instance.chain().toggleUnderline().run();
    expect(instance.isActive('bold')).toBe(false);
    expect(instance.isActive('underline')).toBe(false);
  });

  it('カーソル位置で太字＋下線を有効化した後、両方を解除して通常文字を続けられる', () => {
    const instance = createEditor('<p></p>');
    instance.chain().focus().toggleBold().toggleUnderline().insertContent('装').run();
    instance.commands.insertContent('飾');
    instance.chain().unsetBold().unsetUnderline().insertContent('通常').run();

    const html = instance.getHTML();
    expect(html).toContain('<strong><u>装飾</u></strong>');
    expect(html).toContain('通常');
    expect(html).not.toContain('<u>通常</u>');
    expect(html).not.toContain('<strong>通常</strong>');
  });

  it('選択した色は連続入力で維持され、明示的な黒へのリセット後は黒になる', () => {
    const instance = createEditor('<p></p>');
    instance.chain().setColor('#2563eb').insertContent('青').run();
    instance.commands.insertContent('文字');
    expect(instance.getHTML()).toMatch(/color: (?:#2563eb|rgb\(37, 99, 235\));?">青文字/);

    const textStyle = instance.schema.marks.textStyle;
    instance.view.dispatch(instance.state.tr.setStoredMarks([textStyle.create({ color: '#111827' })]));
    instance.commands.insertContent('通常');
    expect(instance.getHTML()).not.toContain('>青文字通常</span>');
  });

  it('色・サイズ・太字・下線を併用後にすべて解除できる', () => {
    const instance = createEditor();
    instance.chain().setTextSelection({ from: 1, to: 4 }).toggleBold().toggleUnderline().setColor('#ff0000').setFontSize('24px').run();
    expect(instance.getHTML()).toContain('font-size: 24px');
    expect(instance.getHTML()).toContain('line-height: 1.4');

    instance.chain().unsetAllMarks().setFontSize('14px').setColor('#111827').run();
    expect(instance.isActive('bold')).toBe(false);
    expect(instance.isActive('underline')).toBe(false);
    expect(instance.getAttributes('textStyle')).toMatchObject({ fontSize: '14px', color: '#111827' });
  });

  it('旧形式の過大な文字サイズを最大24pxへ正規化する', () => {
    const normalized = normalizeStudentNoteHtml('<p><span style="font-size: 48px">大</span><font size="7">旧</font></p>');
    expect(normalized).not.toContain('48px');
    expect(normalized).not.toContain('<font');
    expect(normalized.match(/font-size: 24px/g)).toHaveLength(2);
    expect(normalized.match(/line-height: 1.4/g)).toHaveLength(2);
  });
});
