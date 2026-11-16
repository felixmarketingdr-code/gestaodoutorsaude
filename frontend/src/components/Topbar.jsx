
import {
  Menu,
  ArrowLeft,
  House,
  UserRound,
  LogOut,
} from "lucide-react";

import "./Topbar.css";

export default function Topbar({
  onToggle,
  onBack,
  onHome,
  onProfile,
  onLogout,
}) {
  return (
    <header className="admin-topbar">
      <div className="topbar-controls">
        <button
          type="button"
          onClick={onToggle}
          title="Recolher ou expandir menu"
        >
          <Menu size={17} />
        </button>

        <button
          type="button"
          onClick={onBack}
          title="Voltar à página anterior"
        >
          <ArrowLeft size={17} />
        </button>
      </div>

      <div className="topbar-links">
        <button type="button" onClick={onHome}>
          <House size={12} />
          <span>Painel</span>
        </button>

        <button type="button" onClick={onProfile}>
          <UserRound size={12} />
          <span>Meu Cadastro</span>
        </button>

        <button type="button" onClick={onLogout}>
          <LogOut size={12} />
          <span>Encerrar Sessão</span>
        </button>
      </div>
    </header>
  );
}
