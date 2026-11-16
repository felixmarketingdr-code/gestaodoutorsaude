import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";

import { auth } from "./config/firebase";

import Login from "./pages/Login";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import MeuCadastro from "./pages/MeuCadastro";
import Dashboard from "./pages/Dashboard";
import NovoContrato from "./pages/NovoContrato";
import ClientesCadastrados from "./pages/ClientesCadastrados";
import TodasVendas from "./pages/TodasVendas";
import TodasCarteirinhas from "./pages/TodasCarteirinhas";
import TodasExames from "./pages/TodasExames";
import TodasConsultas from "./pages/TodasConsultas";
import VendaCarteirinha from "./pages/VendaCarteirinha";
import VendaExames from "./pages/VendaExames";
import Checkout from "./pages/Checkout";
import Planos from "./pages/Planos";
import Usuarios from "./pages/Usuarios";

// NOVO IMPORT: MÓDULO DE VENDAS DE CONSULTAS
import VendasConsulta from "./pages/VendasConsulta";
import VendasPendentes from "./pages/VendasPendentes";
import VendasCanceladas from "./pages/VendasCanceladas";
import TodosAgendamentos from "./pages/TodosAgendamentos";
import Relatorios from "./pages/Relatorios";

// ==========================================
// DEPARTAMENTOS OFICIAIS
// ==========================================

const DEPARTAMENTOS = [
  {
    id: "comercial-exames",
    nome: "Comercial Exames",
  },
  {
    id: "comercial-google",
    nome: "Comercial Google",
  },
  {
    id: "comercial-lead",
    nome: "Comercial Lead",
  },
  {
    id: "comercial-vendas",
    nome: "Comercial Vendas",
  },
];

// ==========================================
// APLICAÇÃO PRINCIPAL
// ==========================================

export default function App() {
  const [usuario, setUsuario] = useState(undefined);
  const [recolhido, setRecolhido] = useState(false);
  const [vendaExameCheckout, setVendaExameCheckout] = useState(null);
  const [vendaConsultaCheckout, setVendaConsultaCheckout] = useState(null);

  const [pagina, setPagina] = useState(() => {
    return window.location.pathname === "/"
      ? "/painel"
      : window.location.pathname;
  });

  // ==========================================
  // AUTENTICAÇÃO FIREBASE
  // ==========================================

  useEffect(() => {
    const cancelar = onAuthStateChanged(
      auth,
      (usuarioAtual) => {
        setUsuario(usuarioAtual);
      }
    );

    return () => cancelar();
  }, []);

  // ==========================================
  // SINCRONIZAÇÃO DO HISTÓRICO
  // ==========================================

  useEffect(() => {
    function atualizarPagina() {
      const caminho = window.location.pathname;

      setPagina(
        caminho === "/" ? "/painel" : caminho
      );
    }

    window.addEventListener("popstate", atualizarPagina);

    return () => {
      window.removeEventListener(
        "popstate",
        atualizarPagina
      );
    };
  }, []);

  // ==========================================
  // NAVEGAÇÃO
  // ==========================================

  function navegar(caminho, substituir = false) {
    if (!caminho) return;

    if (window.location.pathname !== caminho) {
      if (substituir) {
        window.history.replaceState({}, "", caminho);
      } else {
        window.history.pushState({}, "", caminho);
      }
    }

    setPagina(caminho);
  }

  // Recebe a venda de exames já gravada no Firestore e abre o checkout
  // dentro da aplicação, mantendo o vínculo com o mesmo ID de venda.
  async function iniciarCheckoutExame(dados) {
    if (!dados?.vendaId) {
      return { ok: false, message: "A venda de exames não possui identificador." };
    }

    try {
      const token = dados.tokenFirebase || await auth.currentUser?.getIdToken();

      if (!token) {
        return { ok: false, message: "Sua sessão expirou. Entre novamente no sistema." };
      }

      setVendaExameCheckout({
        ...dados,
        vendaId: String(dados.vendaId),
        tokenFirebase: token,
      });

      navegar("/checkout/exames");

      return { ok: true, checkoutAberto: true };
    } catch (error) {
      console.error("Erro ao abrir checkout de exames:", error);

      return {
        ok: false,
        message: error.message || "Não foi possível abrir o checkout.",
      };
    }
  }

  // Recebe a venda de consulta já registrada no Firestore e abre
  // o checkout específico, mantendo o mesmo ID da venda.
  async function iniciarCheckoutConsulta(dados) {
    const vendaId = dados?.vendaId || dados?.id;

    if (!vendaId) {
      return {
        ok: false,
        message: "A venda de consultas não possui identificador.",
      };
    }

    try {
      const token =
        dados.tokenFirebase ||
        await auth.currentUser?.getIdToken();

      if (!token) {
        return {
          ok: false,
          message: "Sua sessão expirou. Entre novamente no sistema.",
        };
      }

      const clienteDados = dados.cliente || {};

      setVendaConsultaCheckout({
        ...dados,
        vendaId: String(vendaId),
        id: String(vendaId),
        valorTotal: Number(dados.valorTotal ?? dados.valor ?? 0),
        valor: Number(dados.valorTotal ?? dados.valor ?? 0),
        clienteNome:
          dados.clienteNome ||
          clienteDados.nome ||
          "",
        clienteCPF:
          dados.clienteCPF ||
          clienteDados.cpf ||
          clienteDados.documento ||
          "",
        clienteTelefone:
          dados.clienteTelefone ||
          clienteDados.telefone ||
          "",
        tokenFirebase: token,
      });

      navegar("/checkout/consultas");

      return { ok: true, checkoutAberto: true };
    } catch (error) {
      console.error("Erro ao abrir checkout de consultas:", error);

      return {
        ok: false,
        message:
          error.message ||
          "Não foi possível abrir o checkout de consultas.",
      };
    }
  }

  function voltarVendaConsultas() {
    navegar("/vendas/consultas");
  }

  function voltarVendaExames() {
    navegar("/vendas/exames");
  }

  // ==========================================
  // VOLTAR
  // ==========================================

  function voltar() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navegar("/painel");
    }
  }

  // ==========================================
  // ENCERRAR SESSÃO
  // ==========================================

  async function sair() {
    try {
      await signOut(auth);

      window.history.replaceState({}, "", "/");

      // Limpa operações comerciais em andamento
      sessionStorage.removeItem("operacaoComercialPendente");

      // Limpa solicitação de edição
      sessionStorage.removeItem("clienteParaEditar");

      // Limpa operação da venda de carteirinha
      sessionStorage.removeItem("vendaCarteirinha");

      setPagina("/painel");
      setRecolhido(false);
      setVendaConsultaCheckout(null);
    } catch (error) {
      console.error("Erro ao encerrar sessão:", error);

      alert("Não foi possível encerrar a sessão.");
    }
  }

  // ==========================================
  // CARREGAMENTO
  // ==========================================

  if (usuario === undefined) {
    return (
      <div className="tela-carregamento">
        Verificando acesso...
      </div>
    );
  }

  // ==========================================
  // LOGIN
  // ==========================================

  if (!usuario) {
    return <Login />;
  }

  // ==========================================
  // COMPONENTE DE PÁGINA EM CONSTRUÇÃO
  // ==========================================

  function paginaEmConstrucao(titulo, descricao) {
    return (
      <section className="admin-content">
        <h1>{titulo}</h1>

        <p>{descricao}</p>

        <button
          className="voltar-painel"
          type="button"
          onClick={() => navegar("/painel")}
        >
          Voltar ao Painel
        </button>
      </section>
    );
  }

  // ==========================================
  // RENDERIZAR PÁGINAS
  // ==========================================

  function renderizarPagina() {
    switch (pagina) {

      // ======================================
      // PAINEL
      // ======================================

      case "/":
      case "/painel":
        return (
          <Dashboard
            usuario={usuario}
            departamentos={DEPARTAMENTOS}
            onNavigate={navegar}
          />
        );

      // ======================================
      // MEU CADASTRO
      // ======================================

      case "/meu-cadastro":
        return (
          <MeuCadastro usuario={usuario} />
        );

      // ======================================
      // NOVO CLIENTE / EDIÇÃO DE CLIENTE
      // ======================================

      case "/clientes/novo":
      case "/contratos/novo":
        return (
          <NovoContrato
            usuario={usuario}
            onNavigate={navegar}
          />
        );

      // ======================================
      // VENDA DE CARTEIRINHA
      // ======================================

      case "/vendas/carteirinha":
        return (
          <VendaCarteirinha
            usuario={usuario}
            onNavigate={navegar}
          />
        );

      // ======================================
      // VENDA EXAMES
      // ======================================

      case "/vendas/exames":
        return (
          <VendaExames
            usuario={usuario}
            onNavigate={navegar}
            onCriarCheckoutExame={iniciarCheckoutExame}
            vendaExameRetorno={vendaExameCheckout}
          />
        );

      case "/checkout/exames":
        return vendaExameCheckout ? (
          <Checkout
            vendaExame={vendaExameCheckout}
            cliente={vendaExameCheckout.cliente}
            clienteId={
              vendaExameCheckout.cliente?.id ||
              vendaExameCheckout.clienteId ||
              ""
            }
            contratoId={vendaExameCheckout.contratoId || ""}
            tokenFirebase={vendaExameCheckout.tokenFirebase}
            onVoltar={voltarVendaExames}
          />
        ) : (
          <section className="admin-content">
            <h1>Checkout de exames não encontrado</h1>

            <p>
              Retorne à venda de exames e gere novamente o pagamento.
            </p>

            <button
              className="voltar-painel"
              type="button"
              onClick={voltarVendaExames}
            >
              Voltar para venda de exames
            </button>
          </section>
        );

      // ======================================
      // CHECKOUT DE CONSULTAS
      // ======================================

      case "/checkout/consultas":
        return vendaConsultaCheckout ? (
          <Checkout
            vendaConsulta={vendaConsultaCheckout}
            cliente={vendaConsultaCheckout.cliente}
            tokenFirebase={vendaConsultaCheckout.tokenFirebase}
            onVoltar={voltarVendaConsultas}
          />
        ) : (
          <section className="admin-content">
            <h1>Checkout de consultas não encontrado</h1>

            <p>
              Retorne à venda de consultas e inicie novamente a cobrança.
            </p>

            <button
              className="voltar-painel"
              type="button"
              onClick={voltarVendaConsultas}
            >
              Voltar para vendas de consultas
            </button>
          </section>
        );

      // ======================================
      // VENDAS CONSULTAS
      // ======================================

      case "/vendas/consultas":
        return (
          <VendasConsulta
            usuario={usuario}
            onNavigate={navegar}
            onCriarCheckoutConsulta={iniciarCheckoutConsulta}
          />
        );

      // ======================================
      // CLIENTES CADASTRADOS
      // ======================================

      case "/clientes":
      case "/clientes/cadastrados":
        return (
          <ClientesCadastrados
            usuario={usuario}
            onNavigate={navegar}
          />
        );

      // ======================================
      // TODAS AS VENDAS
      // ======================================

      case "/vendas":
        return (
          <TodasVendas
            usuario={usuario}
            onNavigate={navegar}
          />
        );

      // ======================================
      // LISTAGEM DE VENDAS
      // ======================================

      case "/vendas/carteirinhas":
        return (
          <TodasCarteirinhas
            usuario={usuario}
            onNavigate={navegar}
          />
        );

      case "/vendas/exames/lista":
        return (
          <TodasExames usuario={usuario} />
        );

      case "/vendas/consultas/lista":
        return (
          <TodasConsultas usuario={usuario} />
        );

      // ======================================
      // VENDAS PENDENTES
      // ======================================

      case "/vendas/pendentes":
  return (
    <VendasPendentes
      usuario={usuario}
      onNavigate={navegar}
    />
  );
      // ======================================
      // VENDAS CANCELADAS
      // ======================================

      case "/vendas/canceladas":
  return (
    <VendasCanceladas
      usuario={usuario}
    />
  );

      // ======================================
      // PLANOS
      // ======================================

      case "/planos":
        return (
          <Planos
            usuario={usuario}
            onNavigate={navegar}
          />
        );

      // ======================================
      // COMISSÃO
      // ======================================

      case "/comissao":
        return paginaEmConstrucao(
          "Comissões",
          "Consulte a gerencia para as comissões dos colaboradores."
        );

      // ======================================
      // AGENDAMENTOS
      // ======================================

      case "/agendamentos":
        return (
          <TodosAgendamentos
            usuario={usuario}
          />
        );

      case "/agendamentos/especialidades":
        return paginaEmConstrucao(
          "Buscar Especialidades",
          "Pesquise especialidades disponíveis."
        );

      // ======================================
      // CLÍNICAS
      // ======================================

      case "/clinicas":
      case "/clinicas/medicos":
      case "/clinicas/especialidades":
      case "/clinicas/procedimentos":
      case "/clinicas/tuss":
        return paginaEmConstrucao(
          "Módulo de Clínicas",
          `Página: ${pagina.replaceAll("/", " / ")}`
        );

      // ======================================
      // RELATÓRIOS
      // ======================================

      case "/relatorios":
  return <Relatorios usuario={usuario} />;

      // ======================================
      // USUÁRIOS
      // ======================================

      case "/usuarios":
        return (
          <Usuarios
            usuario={usuario}
          />
        );

      // ======================================
      // INTEGRAÇÃO ENEL
      // ======================================

      case "/enel/ocorrencias":
      case "/enel/cobrancas":
      case "/enel/faturamento":
      case "/enel/arrecadacoes":
      case "/enel/movimentos":
      case "/enel/cancelamento":
      case "/enel/arquivos":
        return paginaEmConstrucao(
          "Integração ENEL",
          `Página: ${pagina.replaceAll("/", " / ")}`
        );

      // ======================================
      // TABELAS AUXILIARES
      // ======================================

      case "/tabelas/concessionarias":
      case "/tabelas/pendencias":
      case "/tabelas/estado-civil":
      case "/tabelas/escolaridade":
      case "/tabelas/profissao":
      case "/tabelas/canais-venda":
      case "/tabelas/parentesco":
      case "/tabelas/motivos-cancelamento":
      case "/tabelas/departamentos":
        return paginaEmConstrucao(
          "Tabelas Auxiliares",
          `Página: ${pagina.replaceAll("/", " / ")}`
        );

      // ======================================
      // NOTA FISCAL
      // ======================================

      case "/nfse/lotes":
      case "/nfse/configuracao":
        return paginaEmConstrucao(
          "Nota Fiscal de Serviço",
          `Página: ${pagina.replaceAll("/", " / ")}`
        );

      // ======================================
      // ROTAS ANTIGAS
      // ======================================

      case "/contratos/todos":
        return paginaEmConstrucao(
          "Todos os Contratos",
          "Consulte os contratos registrados no sistema."
        );

      // ======================================
      // PÁGINA NÃO ENCONTRADA
      // ======================================

      default:
        return (
          <section className="admin-content">
            <h1>Página não encontrada</h1>

            <p>
              O endereço solicitado não está disponível:{" "}
              {pagina}
            </p>

            <button
              className="voltar-painel"
              type="button"
              onClick={() => navegar("/painel")}
            >
              Voltar ao Painel
            </button>
          </section>
        );
    }
  }

  // ==========================================
  // ESTRUTURA DO SISTEMA
  // ==========================================

  return (
    <div className="admin-container">

      {/* MENU LATERAL */}

      <Sidebar
        usuario={usuario}
        recolhido={recolhido}
        onNavigate={navegar}
        paginaAtual={pagina}
        onLogout={sair}
      />

      {/* CONTEÚDO PRINCIPAL */}

      <main
        className={`admin-main ${
          recolhido ? "menu-recolhido" : ""
        }`}
      >

        {/* BARRA SUPERIOR */}

        <Topbar
          onToggle={() =>
            setRecolhido((anterior) => !anterior)
          }
          onBack={voltar}
          onHome={() => navegar("/painel")}
          onProfile={() => navegar("/meu-cadastro")}
          onLogout={sair}
        />

        {/* PÁGINA ATUAL */}

        {renderizarPagina()}

      </main>
    </div>
  );
}