// Inline markdown image with a loading placeholder, aspect-ratio-preserving
// sizing (fit container width, capped max height) and a graceful error caption.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Text as RNText, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { fontFamily, useTheme } from '@/theme';

interface MarkdownImageProps {
  src: string;
  alt?: string;
}

const MAX_HEIGHT = 360;

export function MarkdownImage({ src, alt }: MarkdownImageProps): React.JSX.Element {
  const theme = useTheme();
  const [ratio, setRatio] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    setRatio(null);
    setFailed(false);
    setLoaded(false);
    if (!src) {
      setFailed(true);
      return;
    }
    Image.getSize(
      src,
      (w, h) => {
        if (alive && w > 0 && h > 0) setRatio(w / h);
      },
      () => {
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [src]);

  if (failed) {
    return (
      <View style={styles.fallback}>
        <RNText style={styles.fallbackText}>
          {alt && alt.length > 0 ? `🖼 ${alt}` : `🖼 ${src || 'image'}`}
        </RNText>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Image
        source={{ uri: src }}
        accessibilityLabel={alt}
        resizeMode="contain"
        onLoad={(e) => {
          const { width, height } = e.nativeEvent.source;
          if (ratio == null && width > 0 && height > 0) setRatio(width / height);
          setLoaded(true);
        }}
        onError={() => setFailed(true)}
        style={[styles.image, { aspectRatio: ratio ?? 16 / 9 }]}
      />
      {!loaded && (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.brand} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    width: '100%',
    marginVertical: theme.space[2],
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    maxHeight: MAX_HEIGHT,
    borderRadius: theme.radii.md,
  },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallback: {
    marginVertical: theme.space[2],
    padding: theme.space[3],
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.card,
  },
  fallbackText: {
    color: theme.colors.ink3,
    fontFamily: fontFamily.uiRegular,
    fontSize: 13,
  },
}));
