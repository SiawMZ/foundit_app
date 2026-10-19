import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, space, type, useColors, type Colors, type TypeVariant } from '@/lib/theme';

type Tone = 'text' | 'muted' | 'accent' | 'inverse' | 'danger';

/** All text goes through here so every string uses the Swiss type scale. */
export function T({
  variant = 'body',
  tone = 'text',
  style,
  ...props
}: TextProps & { variant?: TypeVariant; tone?: Tone; style?: StyleProp<TextStyle> }) {
  const c = useColors();
  const color: Record<Tone, string> = {
    text: c.text,
    muted: c.muted,
    accent: c.accent,
    inverse: c.inverse,
    danger: c.danger,
  };
  return <Text {...props} style={[type[variant], { color: color[tone] }, style]} />;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  /** primary: red fill · secondary: black outline · ghost: text only · danger: red outline */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  const look = buttonLook(c, variant);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        { backgroundColor: look.bg, borderColor: look.border },
        (pressed || hovered) && !disabled && { backgroundColor: look.activeBg },
        disabled && { opacity: 0.35 },
        style,
      ]}>
      {({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) =>
        loading ? (
          <ActivityIndicator color={look.fg} />
        ) : (
          <Text
            style={[
              type.label,
              size === 'md' && { fontSize: 12 },
              { color: (pressed || hovered) && !disabled ? look.activeFg : look.fg },
            ]}>
            {label}
          </Text>
        )
      }
    </Pressable>
  );
}

function buttonLook(c: Colors, variant: 'primary' | 'secondary' | 'ghost' | 'danger') {
  switch (variant) {
    case 'primary':
      return { bg: c.accent, border: c.accent, fg: c.onAccent, activeBg: c.text, activeFg: c.inverse };
    case 'secondary':
      return { bg: 'transparent', border: c.line, fg: c.text, activeBg: c.text, activeFg: c.inverse };
    case 'danger':
      return { bg: 'transparent', border: c.danger, fg: c.danger, activeBg: c.danger, activeFg: c.onAccent };
    case 'ghost':
      return { bg: 'transparent', border: 'transparent', fg: c.text, activeBg: c.surface, activeFg: c.text };
  }
}

export function Field(props: TextInputProps & { label?: string; right?: ReactNode }) {
  const c = useColors();
  const { label, style, right, ...rest } = props;
  const input = (
    <TextInput
      placeholderTextColor={c.muted}
      {...rest}
      style={[
        styles.input,
        type.body,
        { color: c.text, borderColor: c.line, backgroundColor: c.bg },
        rest.multiline && { minHeight: 96, textAlignVertical: 'top', paddingTop: space.md },
        // With a control inside the box, the border moves to the wrapper.
        right ? { flex: 1, borderWidth: 0 } : null,
        style,
      ]}
    />
  );
  return (
    <View style={{ gap: space.sm }}>
      {label ? <T variant="label" tone="muted">{label}</T> : null}
      {right ? (
        <View style={[styles.inputRow, { borderColor: c.line, backgroundColor: c.bg }]}>
          {input}
          {right}
        </View>
      ) : (
        input
      )}
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  onLongPress,
  count,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  count?: number;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? c.text : c.bg,
          borderColor: active ? c.text : c.line,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <Text style={[type.label, { color: active ? c.inverse : c.text }]} numberOfLines={1}>
        {label}
      </Text>
      {count !== undefined ? (
        <Text style={[type.number, { color: active ? c.inverse : c.muted }]}>{count}</Text>
      ) : null}
    </Pressable>
  );
}

/** Square checkbox; filled red when checked. */
export function Check({ checked, size = 22 }: { checked: boolean; size?: number }) {
  const c = useColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderWidth: 2,
        borderColor: checked ? c.accent : c.line,
        backgroundColor: checked ? c.accent : c.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {checked ? <Text style={{ color: c.onAccent, fontFamily: fonts.bold, fontSize: size * 0.6, lineHeight: size * 0.7 }}>✓</Text> : null}
    </View>
  );
}

export function Rule({ strong, style }: { strong?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ height: strong ? 2 : StyleSheet.hairlineWidth, backgroundColor: strong ? c.line : c.border }, style]} />;
}

/** Numbered section label: "01  FOLDER" with a rule underneath. */
export function SectionLabel({ children, index }: { children: ReactNode; index?: string }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        {index ? <T variant="number" tone="accent">{index}</T> : null}
        <T variant="label">{children}</T>
      </View>
      <Rule />
    </View>
  );
}

/** Screen title block: big flush-left heading, optional count and actions on the right. */
export function ScreenHeader({
  title,
  meta,
  actions,
}: {
  title: string;
  meta?: string;
  actions?: ReactNode;
}) {
  return (
    <View style={{ gap: space.md }}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: space.xs }}>
          {meta ? <T variant="label" tone="muted">{meta}</T> : null}
          <T variant="display" numberOfLines={1}>
            {title}
          </T>
        </View>
        {actions ? <View style={styles.headerActions}>{actions}</View> : null}
      </View>
      <Rule strong />
    </View>
  );
}

/** Bottom sheet on phones, centered panel on wide screens. Closes on backdrop tap. */
export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetWrap}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: c.backdrop }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { backgroundColor: c.bg, borderColor: c.line, paddingBottom: space.xl + insets.bottom }]}>
          <View style={styles.sheetHeader}>
            <T variant="title">{title}</T>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <T variant="title">×</T>
            </Pressable>
          </View>
          <Rule strong />
          <ScrollView contentContainerStyle={{ gap: space.lg, paddingTop: space.lg }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSm: { minHeight: 34, paddingHorizontal: space.md },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, paddingRight: space.sm },
  input: {
    minHeight: 46,
    borderWidth: 2,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  chip: {
    height: 32,
    paddingHorizontal: space.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  headerActions: { flexDirection: 'row', gap: space.sm, alignItems: 'center', paddingBottom: 4 },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '85%',
    borderTopWidth: 2,
    padding: space.xl,
    gap: space.md,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
