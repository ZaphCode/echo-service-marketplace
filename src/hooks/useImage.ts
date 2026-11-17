import * as ImagePicker from "expo-image-picker";
import { useState } from "react";

export default function useImage() {
  const [loading, setLoading] = useState(false);
  const pickImage = async (
    from: "camera" | "library",
    opt: ImagePicker.ImagePickerOptions
  ) => {
    setLoading(true);
    try {
      if (from === "library") {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) throw new Error("Permiso denegado");
        return await ImagePicker.launchImageLibraryAsync(opt);
      }

      if (from === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error("Permiso de cámara denegado");
        return await ImagePicker.launchCameraAsync(opt);
      }

      throw new Error("Opción no válida");
    } finally {
      // Also runs when permission is denied or the picker throws.
      setLoading(false);
    }
  };
  return { pickImage, loading };
}
