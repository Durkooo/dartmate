import type { ImageSourcePropType } from 'react-native';

type TrainingIcon =
  | 'clock'
  | 'bobs'
  | 'c121'
  | 'highscore'
  | 'finishing'
  | 'randomCheckout'
  | 'bull';

/** Ikony tréningov (z návrhu ikon DartMate). */
export const TRAINING_ICONS: Record<TrainingIcon, ImageSourcePropType> = {
  clock: require('../assets/training/clock.png'),
  bobs: require('../assets/training/bobs.png'),
  c121: require('../assets/training/c121.png'),
  highscore: require('../assets/training/highscore.png'),
  finishing: require('../assets/training/finishing.png'),
  randomCheckout: require('../assets/training/random-checkout.png'),
  bull: require('../assets/training/bull.png'),
};
