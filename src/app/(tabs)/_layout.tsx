import { Tabs } from 'expo-router/js-tabs';

import { NavBar } from '@/components/nav-bar';
import { useColors, useIsWide } from '@/lib/theme';

export default function TabsLayout() {
  const wide = useIsWide();
  const c = useColors();
  return (
    <Tabs
      tabBar={(props) => <NavBar {...props} wide={wide} />}
      screenOptions={{
        headerShown: false,
        tabBarPosition: wide ? 'left' : 'bottom',
        sceneStyle: { backgroundColor: c.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Links' }} />
      <Tabs.Screen name="folders" options={{ title: 'Folders' }} />
      <Tabs.Screen name="tags" options={{ title: 'Tags' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
