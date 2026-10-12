/** Native working-eye split in the shared 1254 × 1254 scene coordinates. */
export const DENIED_EYE_FRAME_ID = 'denied-eye-frame' as const;

export const DENIED_EYES = [
  {
    id: 'left',
    assetId: 'denied-pupil-left',
    center: {
      x: 482.8421052631579,
      y: 358.5029495849012,
    },
    width: 140.0956937799043,
    height: 50.434449760765546,
    pupilWidth: 70.04784688995215,
    pupilHeight: 56.038277511961724,
    clipId: 'denied-eye-opening-left',
    maxOffset: {
      x: 20,
      y: 8,
    },
  },
  {
    id: 'right',
    assetId: 'denied-pupil-right',
    center: {
      x: 701.3913875598087,
      y: 358.5029495849012,
    },
    width: 140.0956937799043,
    height: 50.434449760765546,
    pupilWidth: 70.04784688995215,
    pupilHeight: 56.038277511961724,
    clipId: 'denied-eye-opening-right',
    maxOffset: {
      x: 20,
      y: 8,
    },
  },
] as const;
