import { Link, useNavigate } from "react-router";
import { useSignedInUser } from "../auth/AuthContext";
import { BackHeader } from "../components/ui";
import Icon from "../components/Icon";
import "./publish.css";

/** Qué publicar: un servicio (solo profesionales) o una contratación (cualquiera). */
export default function Publish() {
  const user = useSignedInUser();
  const navigate = useNavigate();
  return (
    <div className="page detail">
      <BackHeader title="Publicar" onBack={() => navigate(-1)} />
      <div className="publish-options">
        {user.role === "provider" ? (
          <Link className="publish-option" to="/servicio/nuevo">
            <span className="publish-icon">
              <Icon name="briefcase" size={24} />
            </span>
            <strong>Ofrecer un servicio</strong>
            <span className="muted">Publica lo que haces, con fotos y precio base. Los clientes te enviarán solicitudes.</span>
          </Link>
        ) : null}
        <Link className="publish-option" to="/contratacion/nueva">
          <span className="publish-icon">
            <Icon name="user-plus" size={24} />
          </span>
          <strong>Buscar un profesional</strong>
          <span className="muted">Describe lo que necesitas y tu presupuesto. Los profesionales cercanos te mandarán su cotización.</span>
        </Link>
      </div>
    </div>
  );
}
