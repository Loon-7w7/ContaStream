import { redirect } from "next/navigation";

// Twitch y manuales ahora vive dentro de "Agregar datos".
export default function Manuales() {
  redirect("/importar");
}
