import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chip, Field } from '@/components/ui';
import { labelCounts } from '@/lib/filter';
import { useStore } from '@/lib/store';
import { space } from '@/lib/theme';

const MAX_SUGGESTIONS = 8;

export function cleanLabel(text: string) {
  return text.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, ' ').slice(0, 30);
}

/** Current labels (tap to remove), plus a field that suggests labels already used on other links. */
export function LabelEditor({ labels, onChange }: { labels: string[]; onChange: (labels: string[]) => void }) {
  const { links } = useStore();
  const [text, setText] = useState('');

  const suggestions = useMemo(() => {
    const query = cleanLabel(text);
    const unused = labelCounts(links)
      .map(([l]) => l)
      .filter((l) => !labels.includes(l));
    if (!query) return unused.slice(0, MAX_SUGGESTIONS);
    // Prefix matches first, then labels that contain the text anywhere.
    const starts = unused.filter((l) => l.startsWith(query));
    const contains = unused.filter((l) => !l.startsWith(query) && l.includes(query));
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [links, labels, text]);

  function add(label: string) {
    const l = cleanLabel(label);
    setText('');
    if (l && !labels.includes(l)) onChange([...labels, l]);
  }

  const query = cleanLabel(text);
  const isNew = query && !labels.includes(query) && !suggestions.includes(query);

  return (
    <View style={{ gap: space.sm }}>
      {labels.length ? (
        <View style={styles.wrap}>
          {labels.map((l) => (
            <Chip key={l} active label={`${l}  ×`} onPress={() => onChange(labels.filter((x) => x !== l))} />
          ))}
        </View>
      ) : null}
      <Field
        placeholder="Type to find or create a label"
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => add(text)}
        autoCapitalize="none"
        autoCorrect={false}
        submitBehavior="submit"
      />
      {suggestions.length || isNew ? (
        <View style={styles.wrap}>
          {isNew ? <Chip label={`+ Create “${query}”`} onPress={() => add(query)} /> : null}
          {suggestions.map((l) => (
            <Chip key={l} label={`+ ${l}`} onPress={() => add(l)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
