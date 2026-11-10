import { View } from 'react-native';
import { Button } from 'heroui-native';
import { Video, VideoOff, Mic, MicOff, PhoneOff, SwitchCamera, Focus } from 'lucide-react-native';
import { Txt } from '@/components/DartsUI';
import { palette } from '@/lib/darts';

export type VideoControlsProps = {
  camera: boolean;
  microphone: boolean;
  pending: boolean;
  onCamera: () => void;
  onMicrophone: () => void;
  onLeave: () => void;
  onFlip: () => void;
  onFocus: () => void;
};
export function VideoControls({
  camera,
  microphone,
  pending,
  onCamera,
  onMicrophone,
  onLeave,
  onFlip,
  onFocus,
}: VideoControlsProps) {
  return (
    <View className="mt-3 flex-row gap-2">
      {[
        {
          label: camera ? 'Vypnúť kameru' : 'Zapnúť kameru',
          Icon: camera ? Video : VideoOff,
          action: onCamera,
        },
        {
          label: microphone ? 'Vypnúť mikrofón' : 'Zapnúť mikrofón',
          Icon: microphone ? Mic : MicOff,
          action: onMicrophone,
        },
        { label: 'Otočiť kameru', Icon: SwitchCamera, action: onFlip },
        { label: 'Zaostriť na terč', Icon: Focus, action: onFocus },
        { label: 'Odpojiť videohovor', Icon: PhoneOff, action: onLeave },
      ].map(({ label, Icon, action }) => (
        <Button
          key={label}
          className="flex-1"
          variant="secondary"
          isIconOnly
          isDisabled={pending}
          accessibilityLabel={label}
          onPress={action}
        >
          <Icon size={20} color={palette.ink} strokeWidth={1.8} />
        </Button>
      ))}
    </View>
  );
}
export function VideoNotice({
  error,
  pending,
  retry,
  leave,
}: {
  error: string;
  pending: boolean;
  retry: () => void;
  leave: () => void;
}) {
  return (
    <View className="bg-surface gap-3 rounded-xl p-4">
      <Txt style={{ fontFamily: 'Inter_600SemiBold' }}>Videohovor</Txt>
      <Txt
        className={error ? 'text-danger text-[13px] leading-5' : 'text-muted text-[13px]'}
        accessibilityRole={error ? 'alert' : undefined}
      >
        {error || 'Pripájam videohovor…'}
      </Txt>
      {!!error && (
        <Button variant="secondary" isDisabled={pending} onPress={retry}>
          <Button.Label>Skúsiť znova</Button.Label>
        </Button>
      )}
      <Button variant="ghost" onPress={leave}>
        <Button.Label>Zavrieť</Button.Label>
      </Button>
    </View>
  );
}
