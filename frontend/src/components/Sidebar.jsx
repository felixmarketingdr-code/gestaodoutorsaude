
import { useEffect, useState } from "react";

import {
  LayoutDashboard,
  UserRoundPlus,
  UserPlus,
  Users,
  CreditCard,
  Stethoscope,
  CalendarDays,
  ShoppingBag,
  ClipboardList,
  Tag,
  Building2,
  ChartNoAxesColumn,
  UserCog,
  Zap,
  Settings,
  Receipt,
  ChevronDown,
  ChevronRight,
  Plus,
  List,
  CheckCircle,
  Clock,
  XCircle,
  Search,
  BriefcaseMedical,
  BookOpen,
  GraduationCap,
  HeartPulse,
  FolderOpen,
  Wallet,
  Bell,
  Handshake,
  LogOut,
  FileText,
} from "lucide-react";

import logo from "../assets/logotipo.jpg";
import "./Sidebar.css";

// ==========================================
// MENU PRINCIPAL
// ==========================================

const menus = [
  // PAINEL
  {
    nome: "Painel",
    icone: LayoutDashboard,
    caminho: "/painel",
  },

  // ========================================
  // NOVO CLIENTE E OPERAÇÕES COMERCIAIS
  // ========================================

  {
    nome: "Novo Cliente",
    icone: UserRoundPlus,
    submenu: [
      {
        nome: "Cadastro de Cliente",
        icone: UserPlus,
        caminho: "/clientes/novo",
      },
      {
        nome: "Venda de Carteirinha",
        icone: CreditCard,
        caminho: "/vendas/carteirinha",
      },
      {
        nome: "Venda de Exames",
        icone: Stethoscope,
        caminho: "/vendas/exames",
      },
      {
        nome: "Venda de Consulta",
        icone: CalendarDays,
        caminho: "/vendas/consultas",
      },
    ],
  },

  // ========================================
  // CLIENTES CADASTRADOS
  // ========================================

  {
    nome: "Clientes Cadastrados",
    icone: Users,
    caminho: "/clientes",
  },

  // ========================================
  // TODAS AS VENDAS
  // ========================================

  {
    nome: "Todas as Vendas",
    icone: ShoppingBag,
    submenu: [
      {
        nome: "Todas as Vendas",
        icone: List,
        caminho: "/vendas",
      },
      {
        nome: "Carteirinhas",
        icone: CreditCard,
        caminho: "/vendas/carteirinhas",
      },
      {
        nome: "Exames",
        icone: Stethoscope,
        caminho: "/vendas/exames/lista",
      },
      {
        nome: "Consultas",
        icone: CalendarDays,
        caminho: "/vendas/consultas/lista",
      },
      {
        nome: "Pendentes",
        icone: Clock,
        caminho: "/vendas/pendentes",
      },
      {
        nome: "Canceladas",
        icone: XCircle,
        caminho: "/vendas/canceladas",
      },
    ],
  },

  // ========================================
  // PLANOS
  // ========================================

  {
    nome: "Planos",
    icone: ClipboardList,
    caminho: "/planos",
  },

  // ========================================
  // COMISSÃO
  // ========================================

  {
    nome: "Comissão",
    icone: Tag,
    caminho: "/comissao",
  },

  // ========================================
  // AGENDAMENTOS
  // ========================================

  {
    nome: "Agendamentos",
    icone: CalendarDays,
    submenu: [
      {
        nome: "Todos os Agendamentos",
        icone: List,
        caminho: "/agendamentos",
      },
    ],
  },

  // ========================================
  // CLÍNICAS
  // ========================================

  {
    nome: "Clínicas",
    icone: Building2,
    submenu: [
      {
        nome: "Clínicas",
        icone: Building2,
        caminho: "/clinicas",
      },
      {
        nome: "Médicos",
        icone: Stethoscope,
        caminho: "/clinicas/medicos",
      },
      {
        nome: "Especialidades",
        icone: HeartPulse,
        caminho: "/clinicas/especialidades",
      },
      {
        nome: "Procedimentos",
        icone: BriefcaseMedical,
        caminho: "/clinicas/procedimentos",
      },
      {
        nome: "Lista Proced. TUSS",
        icone: BookOpen,
        caminho: "/clinicas/tuss",
      },
    ],
  },

  // ========================================
  // RELATÓRIOS
  // ========================================

  {
    nome: "Relatórios",
    icone: ChartNoAxesColumn,
    caminho: "/relatorios",
  },

  // ========================================
  // USUÁRIOS
  // ========================================

  {
    nome: "Usuários",
    icone: UserCog,
    caminho: "/usuarios",
  },

  
  // ========================================
  // NOTA FISCAL
  // ========================================

  {
    nome: "NFS-e",
    icone: Receipt,
    submenu: [
      {
        nome: "Lotes",
        icone: FileText,
        caminho: "/nfse/lotes",
      },
      {
        nome: "Configuração",
        icone: Settings,
        caminho: "/nfse/configuracao",
      },
    ],
  },
];

// ==========================================
// SIDEBAR
// ==========================================

export default function Sidebar({
  usuario,
  recolhido,
  onNavigate,
  paginaAtual,
  onLogout,
}) {
  const [abertos, setAbertos] = useState({
    "Novo Cliente": false,
    "Todas as Vendas": false,
    Agendamentos: false,
    Clínicas: false,
    "Integração ENEL": false,
    "Tabelas Auxiliares": false,
    "NFS-e": false,
  });

  // ========================================
  // IDENTIFICAR SUBMENU DA PÁGINA ATUAL
  // ========================================

  useEffect(() => {
    const novosAbertos = {};

    menus.forEach((menu) => {
      if (!menu.submenu) return;

      novosAbertos[menu.nome] = menu.submenu.some(
        (item) => item.caminho === paginaAtual
      );
    });

    setAbertos((anterior) => ({
      ...anterior,
      ...novosAbertos,
    }));
  }, [paginaAtual]);

  // ========================================
  // ABRIR E FECHAR SUBMENUS
  // ========================================

  function alternarMenu(nome) {
    if (recolhido) return;

    setAbertos((anterior) => ({
      ...anterior,
      [nome]: !anterior[nome],
    }));
  }

  // ========================================
  // NAVEGAÇÃO
  // ========================================

  function navegar(caminho) {
    if (caminho && onNavigate) {
      onNavigate(caminho);
    }
  }

  // ========================================
  // ENCERRAR SESSÃO
  // ========================================

  function sair() {
    if (onLogout) {
      onLogout();
    }
  }

  // ========================================
  // NOME DO USUÁRIO
  // ========================================

  const nomeUsuario =
    usuario?.displayName ||
    usuario?.email?.split("@")[0] ||
    "Usuário";

  // ========================================
  // IDENTIFICAR ITEM ATIVO
  // ========================================

  function itemEstaAtivo(caminho) {
    if (!caminho) return false;

    if (paginaAtual === caminho) return true;

    // Não marca a rota principal /vendas
    // como ativa nas rotas de vendas específicas.
    if (caminho === "/vendas") return false;

    return paginaAtual.startsWith(caminho + "/");
  }

  // ========================================
  // RENDERIZAÇÃO
  // ========================================

  return (
    <aside
      className={`sidebar ${
        recolhido ? "sidebar-recolhido" : ""
      }`}
    >
      {/* LOGOTIPO */}

      <div className="sidebar-brand">
        <img
          src={logo}
          alt="Gestão Doutor Saúde Familiar"
        />

        {!recolhido && (
          <>
            <strong>Olá, {nomeUsuario}</strong>
            <span>Gestão Doutor Saúde Familiar</span>
          </>
        )}
      </div>

      {/* NAVEGAÇÃO */}

      <nav className="sidebar-navigation">
        {menus.map((menu) => {
          const Icone = menu.icone;
          const temSubmenu = Boolean(menu.submenu);
          const aberto = Boolean(abertos[menu.nome]);

          const ativo = temSubmenu
            ? menu.submenu.some((item) =>
                itemEstaAtivo(item.caminho)
              )
            : itemEstaAtivo(menu.caminho);

          return (
            <div
              className="sidebar-group"
              key={menu.nome}
            >
              <button
                type="button"
                className={`sidebar-item ${
                  ativo ? "ativo" : ""
                }`}
                onClick={() => {
                  if (temSubmenu) {
                    alternarMenu(menu.nome);
                  } else {
                    navegar(menu.caminho);
                  }
                }}
                title={recolhido ? menu.nome : ""}
                aria-expanded={
                  temSubmenu ? aberto : undefined
                }
              >
                <Icone size={16} />

                {!recolhido && (
                  <span>{menu.nome}</span>
                )}

                {!recolhido && temSubmenu && (
                  <span className="sidebar-arrow">
                    {aberto ? (
                      <ChevronDown size={13} />
                    ) : (
                      <ChevronRight size={13} />
                    )}
                  </span>
                )}
              </button>

              {/* SUBMENU */}

              {temSubmenu && aberto && !recolhido && (
                <div className="sidebar-submenu">
                  {menu.submenu.map((item) => {
                    const SubIcone = item.icone;
                    const subAtivo = itemEstaAtivo(
                      item.caminho
                    );

                    return (
                      <button
                        type="button"
                        key={item.caminho}
                        className={`sidebar-subitem ${
                          subAtivo ? "ativo" : ""
                        }`}
                        onClick={() =>
                          navegar(item.caminho)
                        }
                      >
                        <SubIcone size={13} />
                        <span>{item.nome}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* RODAPÉ */}

      <div className="sidebar-bottom">
        <button
          type="button"
          className="sidebar-item"
          onClick={sair}
          title={recolhido ? "Encerrar sessão" : ""}
        >
          <LogOut size={16} />

          {!recolhido && (
            <span>Encerrar Sessão</span>
          )}
        </button>
      </div>
    </aside>
  );
}
