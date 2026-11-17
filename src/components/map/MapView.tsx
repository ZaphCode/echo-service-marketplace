import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform, StyleProp, ViewStyle } from "react-native";
import { ImageRef } from "expo-image";
import { AppleMaps, CameraMoveEvent, GoogleMaps } from "expo-maps";

import { Coords } from "@/utils/geo";
import { loadMarkerIcon } from "./markerIcon";

export type MapMarker = {
  id: string;
  coords: Coords;
  title?: string;
};

export type MapCircle = {
  id: string;
  center: Coords;
  radiusMeters: number;
};

export type MapRegion = {
  center: Coords;
  zoom: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type MapViewHandle = {
  moveTo: (coords: Coords, zoom?: number) => void;
};

type Props = {
  style?: StyleProp<ViewStyle>;
  initialCenter: Coords;
  initialZoom?: number;
  markers?: MapMarker[];
  circles?: MapCircle[];
  showUserLocation?: boolean;
  darkMode?: boolean;
  accentColor: string;
  onRegionChange?: (region: MapRegion) => void;
  onMarkerPress?: (markerId: string) => void;
  onMapPress?: () => void;
};

const toNative = (coords: Coords) => ({
  latitude: coords.lat,
  longitude: coords.lon,
});

const fromCameraEvent = (event: CameraMoveEvent): MapRegion | null => {
  const { latitude, longitude } = event.coordinates;
  if (latitude === undefined || longitude === undefined) return null;
  return {
    center: { lat: latitude, lon: longitude },
    zoom: event.zoom,
    latitudeDelta: event.latitudeDelta,
    longitudeDelta: event.longitudeDelta,
  };
};

/**
 * Android only: Google Maps can't show a text label beside a marker, so each
 * marker gets a custom icon with its title baked in (like Apple Maps shows).
 * Returns a map of marker id -> icon (`null` = failed, use the default pin).
 * Markers without an entry are still loading.
 */
function useMarkerIcons(
  markers: MapMarker[],
  color: string,
  enabled: boolean
): Record<string, ImageRef | null> {
  const [icons, setIcons] = useState<Record<string, ImageRef | null>>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    markers.forEach((marker) => {
      loadMarkerIcon(marker.title ?? "", color).then((icon) => {
        if (cancelled) return;
        setIcons((prev) => {
          const key = iconKey(marker, color);
          return prev[key] === icon ? prev : { ...prev, [key]: icon };
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [markers, color, enabled]);

  return useMemo(() => {
    const byId: Record<string, ImageRef | null> = {};
    markers.forEach((marker) => {
      const key = iconKey(marker, color);
      if (key in icons) byId[marker.id] = icons[key];
    });
    return byId;
  }, [icons, markers, color]);
}

const iconKey = (marker: MapMarker, color: string) =>
  `${color}|${marker.title ?? ""}`;

/** Thin cross-platform wrapper: Apple Maps on iOS, Google Maps on Android. */
const MapView = forwardRef<MapViewHandle, Props>(function MapView(
  {
    style,
    initialCenter,
    initialZoom = 12,
    markers = [],
    circles = [],
    showUserLocation = false,
    darkMode = false,
    accentColor,
    onRegionChange,
    onMarkerPress,
    onMapPress,
  },
  ref
) {
  const appleRef = useRef<AppleMaps.MapView>(null);
  const googleRef = useRef<GoogleMaps.MapView>(null);
  const markerIcons = useMarkerIcons(
    markers,
    accentColor,
    Platform.OS === "android"
  );

  useImperativeHandle(ref, () => ({
    moveTo: (coords, zoom) => {
      const camera = { coordinates: toNative(coords), zoom };
      appleRef.current?.setCameraPosition(camera);
      googleRef.current?.setCameraPosition(camera);
    },
  }));

  // Captured once: a new cameraPosition prop would snap the camera back on
  // every re-render. Use the ref's moveTo() to move it afterwards.
  const [cameraPosition] = useState(() => ({
    coordinates: toNative(initialCenter),
    zoom: initialZoom,
  }));
  const handleCameraMove = (event: CameraMoveEvent) => {
    const region = fromCameraEvent(event);
    if (region) onRegionChange?.(region);
  };
  const circleFill = `${accentColor}33`;

  if (Platform.OS === "ios") {
    return (
      <AppleMaps.View
        ref={appleRef}
        style={style}
        cameraPosition={cameraPosition}
        colorScheme={
          darkMode
            ? AppleMaps.MapColorScheme.DARK
            : AppleMaps.MapColorScheme.LIGHT
        }
        properties={{ isMyLocationEnabled: showUserLocation }}
        uiSettings={{ myLocationButtonEnabled: showUserLocation }}
        markers={markers.map((marker) => ({
          id: marker.id,
          coordinates: toNative(marker.coords),
          title: marker.title,
          tintColor: accentColor,
          systemImage: "briefcase.fill",
        }))}
        circles={circles.map((circle) => ({
          id: circle.id,
          center: toNative(circle.center),
          radius: circle.radiusMeters,
          color: circleFill,
          lineColor: accentColor,
          lineWidth: 1,
        }))}
        onCameraMove={handleCameraMove}
        onMarkerClick={(marker) => marker.id && onMarkerPress?.(marker.id)}
        onMapClick={() => onMapPress?.()}
      />
    );
  }

  return (
    <GoogleMaps.View
      ref={googleRef}
      style={style}
      cameraPosition={cameraPosition}
      colorScheme={
        darkMode
          ? GoogleMaps.MapColorScheme.DARK
          : GoogleMaps.MapColorScheme.LIGHT
      }
      properties={{ isMyLocationEnabled: showUserLocation }}
      uiSettings={{
        myLocationButtonEnabled: showUserLocation,
        mapToolbarEnabled: false,
        zoomControlsEnabled: false,
      }}
      markers={markers
        // Hold back markers whose label icon is still loading so the default
        // red pin doesn't flash before the labelled one.
        .filter((marker) => marker.id in markerIcons)
        .map((marker) => ({
          id: marker.id,
          coordinates: toNative(marker.coords),
          title: marker.title,
          showCallout: false,
          icon: markerIcons[marker.id] ?? undefined,
        }))}
      circles={circles.map((circle) => ({
        id: circle.id,
        center: toNative(circle.center),
        radius: circle.radiusMeters,
        color: circleFill,
        lineColor: accentColor,
        lineWidth: 2,
      }))}
      onCameraMove={handleCameraMove}
      onMarkerClick={(marker) => marker.id && onMarkerPress?.(marker.id)}
      onMapClick={() => onMapPress?.()}
    />
  );
});

export default MapView;
