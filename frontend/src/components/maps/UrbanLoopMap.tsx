import { MapProps, MapMarkerProps } from './MapCore';
export type { MapMarkerProps };
import React from 'react';
import MapCore from './MapCore';

export const UrbanLoopMap: React.FC<MapProps> = (props) => {
  return <MapCore {...props} />;
};
