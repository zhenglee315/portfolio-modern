import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { messages, supportedLocales } from '@/i18n/config';
import { cowMotionCopy } from '@/i18n/cow-copy';
import { createI18n } from '@/i18n/config';

/** Compare leaf keys, retaining full nested names instead of silently falling back to English. */
function dictionaryKeys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof entry === 'string' ? [path] : dictionaryKeys(entry, path);
  });
}

function literalTranslationKeys(directory: URL): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'assets') return [];
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) return literalTranslationKeys(url);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    const source = ts.createSourceFile(
      entry.name,
      readFileSync(url, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const keys: string[] = [];
    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 't' &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        keys.push(node.arguments[0].text);
      ts.forEachChild(node, visit);
    }
    visit(source);
    return keys;
  });
}

describe('fixed UI translation contracts', () => {
  it('keeps the same leaf keys in every supported language', () => {
    const expected = dictionaryKeys(messages.en).sort();
    for (const locale of supportedLocales)
      expect(dictionaryKeys(messages[locale]).sort()).toEqual(expected);
  });

  it('defines every statically requested UI key in every language', () => {
    const requested = [...new Set(literalTranslationKeys(pathToFileURL(`${resolve('src')}/`)))];
    for (const locale of supportedLocales) {
      const available = new Set(dictionaryKeys(messages[locale]));
      expect(
        requested.filter((key) => !available.has(key)),
        locale,
      ).toEqual([]);
    }
  });

  it('resolves the composed cow control and export vocabulary instead of displaying keys', () => {
    for (const locale of supportedLocales) {
      const i18n = createI18n(locale);
      const copy = cowMotionCopy(i18n.t);
      for (const text of [
        copy.group,
        copy.eyeTracking.start,
        copy.leavesSwaying.stop,
        copy.pause.tip,
      ]) {
        expect(text).not.toMatch(/^(auth|accessDenied)\./);
      }
      for (const name of Object.keys(messages[locale].management.export)) {
        const key = `management.export.${name}`;
        expect(i18n.t(key)).not.toBe(key);
      }
    }
  });
});
