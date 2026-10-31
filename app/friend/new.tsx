import { useState } from 'react';
import { View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Button, TextField, Input, Label, FieldError } from 'heroui-native';
import { UserPlus } from 'lucide-react-native';
import { Page, Txt } from '@/components/DartsUI';
import { palette, feedback, useDarts } from '@/lib/darts';

export default function NewFriend() {
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [error, setError] = useState('');
  const friends = useDarts((s) => s.friends);
  const addFriend = useDarts((s) => s.addFriend);
  const hydrated = useDarts((s) => s.hydrated);
  const save = () => {
    const cleanHandle = handle.trim().replace(/^@/, '');
    if (!name.trim() || !cleanHandle) {
      setError('Vyplň meno aj prezývku.');
      feedback.error();
      return;
    }
    if (friends.some((f) => f.handle.toLowerCase() === cleanHandle.toLowerCase())) {
      setError('Túto prezývku už máš medzi priateľmi.');
      feedback.error();
      return;
    }
    addFriend(name.trim(), cleanHandle);
    feedback.success();
    router.dismissTo('/friends');
  };
  return (
    <Page form fallbackHref="/friends" fallbackLabel="Späť k priateľom">
      <Stack.Screen options={{ title: 'Pridať priateľa' }} />
      <View className="mt-4 gap-6">
        <UserPlus size={42} color={palette.ink} strokeWidth={1.8} />
        <Txt className="text-muted">
          V prototype si pridáš hráča do svojej partie. Pozvánky priateľom pribudnú s online hraním.
        </Txt>
        <TextField isRequired>
          <Label>Meno</Label>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="Napr. Tomáš Horváth"
            autoCapitalize="words"
            maxLength={70}
          />
        </TextField>
        <TextField isRequired isInvalid={!!error}>
          <Label>Prezývka</Label>
          <Input
            value={handle}
            onChangeText={(v) => {
              setHandle(v);
              setError('');
            }}
            placeholder="Napr. tomas.h"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={40}
          />
          <FieldError>{error}</FieldError>
        </TextField>
        <Button size="lg" isDisabled={!hydrated} onPress={save}>
          <Button.Label>{hydrated ? 'Pridať do partie' : 'Načítavam…'}</Button.Label>
        </Button>
      </View>
    </Page>
  );
}
