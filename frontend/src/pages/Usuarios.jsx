
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getAuth } from "firebase/auth";

import {
  Users as UsersIcon,
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  Ban,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Lock,
  RefreshCw,
} from "lucide-react";

import "./usuarios.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:3001"
).replace(/\/$/, "");

const MODULOS = [
  "Contratos",
  "Cadastros",
  "Planos",
  "Comissão",
  "Agendamentos",
  "Clínicas",
  "Vendas",
  "Financeiro",
  "Equipe",
  "Relatórios",
  "Usuários",
  "Integração ENEL",
  "Tabelas Auxiliares",
  "Nota Fiscal",
];

const ACOES = [
  "visualizar",
  "incluir",
  "editar",
  "excluir",
];

const PERMISSOES_INICIAIS = {
  visualizar: false,
  incluir: false,
  editar: false,
  excluir: false,
};

const FORM_USUARIO = {
  primeiroNome: "",
  segundoNome: "",
  email: "",
  usuario: "",
  perfil: "",
  ativo: true,
};

function criarPermissoes(permissoesExistentes = {}) {
  const resultado = {};

  MODULOS.forEach((modulo) => {
    resultado[modulo] = {
      ...PERMISSOES_INICIAIS,
      ...(permissoesExistentes?.[modulo] || {}),
    };
  });

  return resultado;
}

function formatarData(valor) {
  if (!valor) return "—";

  try {
    const data = valor?.toDate
      ? valor.toDate()
      : new Date(valor);

    if (Number.isNaN(data.getTime())) return "—";

    return data.toLocaleString("pt-BR");
  } catch {
    return "—";
  }
}

function obterNomeUsuario(item) {
  return (
    item.nome ||
    `${item.primeiroNome || ""} ${item.segundoNome || ""}`.trim() ||
    "—"
  );
}

// Aceita diferentes formatos de resposta da API.
function extrairLista(resposta, propriedade) {
  if (Array.isArray(resposta)) {
    return resposta;
  }

  if (Array.isArray(resposta?.[propriedade])) {
    return resposta[propriedade];
  }

  if (Array.isArray(resposta?.data)) {
    return resposta.data;
  }

  if (Array.isArray(resposta?.resultado)) {
    return resposta.resultado;
  }

  return [];
}

// Normaliza o ID do perfil para o select.
function normalizarPerfil(perfil) {
  return {
    ...perfil,
    id: String(
      perfil.id ||
      perfil.perfilId ||
      perfil.uid ||
      ""
    ),
    nome: perfil.nome || perfil.perfilNome || "",
  };
}

export default function Usuarios() {
  const [aba, setAba] = useState("usuarios");

  const [filtroStatus, setFiltroStatus] = useState("ativos");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);

  const [usuarios, setUsuarios] = useState([]);
  const [perfis, setPerfis] = useState([]);

  const [carregando, setCarregando] = useState(true);
  const [carregandoPerfis, setCarregandoPerfis] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [erro, setErro] = useState("");
  const [erroPerfis, setErroPerfis] = useState("");

  const [modalUsuario, setModalUsuario] = useState(false);
  const [modalPerfil, setModalPerfil] = useState(false);

  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [perfilEditando, setPerfilEditando] = useState(null);

  const [formUsuario, setFormUsuario] = useState({
    ...FORM_USUARIO,
  });

  const [formPerfil, setFormPerfil] = useState({
    nome: "",
    descricao: "",
    permissoes: criarPermissoes(),
  });

  // ========================================
  // REQUISIÇÃO AUTENTICADA
  // ========================================

  const requisicao = useCallback(
    async (endpoint, opcoes = {}) => {
      const usuarioAtual = getAuth().currentUser;

      if (!usuarioAtual) {
        throw new Error(
          "Sua sessão expirou. Entre novamente."
        );
      }

      const token = await usuarioAtual.getIdToken();

      const resposta = await fetch(
        `${API_URL}${endpoint}`,
        {
          ...opcoes,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(opcoes.headers || {}),
          },
        }
      );

      const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        throw new Error(
          dados.mensagem ||
          dados.error ||
          `Erro ${resposta.status} ao acessar ${endpoint}.`
        );
      }

      return dados;
    },
    []
  );

  // ========================================
  // CARREGAR USUÁRIOS
  // ========================================

  const carregarUsuarios = useCallback(async () => {
    try {
      const resposta = await requisicao("/api/usuarios");

      const lista = extrairLista(
        resposta,
        "usuarios"
      );

      setUsuarios(lista);

      return true;
    } catch (error) {
      console.error("Erro ao carregar usuários:", error);

      setUsuarios([]);
      setErro(error.message);

      return false;
    }
  }, [requisicao]);

  // ========================================
  // CARREGAR PERFIS
  // ========================================

  const carregarPerfis = useCallback(async () => {
    setCarregandoPerfis(true);
    setErroPerfis("");

    try {
      const resposta = await requisicao("/api/perfis");

      const lista = extrairLista(
        resposta,
        "perfis"
      );

      const perfisNormalizados = lista
        .map(normalizarPerfil)
        .filter((perfil) => perfil.id && perfil.nome)
        .filter((perfil) => perfil.ativo !== false);

      setPerfis(perfisNormalizados);

      console.log(
        "Perfis carregados:",
        perfisNormalizados
      );

      return true;
    } catch (error) {
      console.error("Erro ao carregar perfis:", error);

      setPerfis([]);
      setErroPerfis(error.message);

      return false;
    } finally {
      setCarregandoPerfis(false);
    }
  }, [requisicao]);

  // ========================================
  // CARREGAR TODOS OS DADOS
  // ========================================

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    setErro("");

    // Cada consulta funciona independentemente.
    // Uma falha na lista de usuários não impede
    // o carregamento dos perfis.
    await Promise.allSettled([
      carregarUsuarios(),
      carregarPerfis(),
    ]);

    setCarregando(false);
  }, [carregarUsuarios, carregarPerfis]);

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // ========================================
  // FILTROS
  // ========================================

  const usuariosFiltrados = useMemo(() => {
    let lista = [...usuarios];

    if (filtroStatus === "ativos") {
      lista = lista.filter(
        (item) => item.ativo !== false
      );
    }

    if (filtroStatus === "inativos") {
      lista = lista.filter(
        (item) => item.ativo === false
      );
    }

    const termo = busca.toLowerCase().trim();

    if (termo) {
      lista = lista.filter((item) => {
        const texto = [
          item.primeiroNome,
          item.segundoNome,
          item.nome,
          item.usuario,
          item.email,
          item.perfilNome,
          item.perfil,
        ]
          .join(" ")
          .toLowerCase();

        return texto.includes(termo);
      });
    }

    return lista;
  }, [usuarios, filtroStatus, busca]);

  const perfisFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();

    if (!termo) return perfis;

    return perfis.filter((item) => {
      const texto = [
        item.nome,
        item.descricao,
      ]
        .join(" ")
        .toLowerCase();

      return texto.includes(termo);
    });
  }, [perfis, busca]);

  const listaAtual =
    aba === "usuarios"
      ? usuariosFiltrados
      : perfisFiltrados;

  const totalPaginas = Math.max(
    1,
    Math.ceil(listaAtual.length / limite)
  );

  const paginaAtual = Math.min(
    pagina,
    totalPaginas
  );

  const itensPagina = listaAtual.slice(
    (paginaAtual - 1) * limite,
    paginaAtual * limite
  );

  // ========================================
  // FORMULÁRIO DE USUÁRIO
  // ========================================

  function atualizarCampoUsuario(campo, valor) {
    setFormUsuario((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  }

  function abrirNovoUsuario() {
    setUsuarioEditando(null);

    setFormUsuario({
      ...FORM_USUARIO,
    });

    setErro("");
    setErroPerfis("");

    setModalUsuario(true);

    // Atualiza a lista de perfis ao abrir o formulário.
    carregarPerfis();
  }

  function abrirEditarUsuario(item) {
    setUsuarioEditando(item);

    setFormUsuario({
      primeiroNome:
        item.primeiroNome ||
        item.nome?.split(" ")[0] ||
        "",

      segundoNome:
        item.segundoNome ||
        item.nome?.split(" ").slice(1).join(" ") ||
        "",

      email: item.email || "",
      usuario: item.usuario || "",

      perfil: String(
        item.perfilId ||
        item.perfil ||
        ""
      ),

      ativo: item.ativo !== false,
    });

    setErro("");
    setErroPerfis("");

    setModalUsuario(true);

    carregarPerfis();
  }

  async function salvarUsuario(evento) {
    evento.preventDefault();
    setErro("");

    if (
      !formUsuario.primeiroNome.trim() ||
      !formUsuario.segundoNome.trim() ||
      !formUsuario.email.trim() ||
      !formUsuario.usuario.trim() ||
      !formUsuario.perfil
    ) {
      setErro(
        "Preencha todos os campos obrigatórios."
      );
      return;
    }

    setSalvando(true);

    try {
      const dados = {
        primeiroNome: formUsuario.primeiroNome.trim(),
        segundoNome: formUsuario.segundoNome.trim(),

        nome: `${formUsuario.primeiroNome.trim()} ${formUsuario.segundoNome.trim()}`,

        email: formUsuario.email.trim().toLowerCase(),
        usuario: formUsuario.usuario.trim(),

        perfil: formUsuario.perfil,
        perfilId: formUsuario.perfil,

        ativo: formUsuario.ativo,
      };

      if (usuarioEditando?.uid) {
        await requisicao(
          `/api/usuarios/${encodeURIComponent(usuarioEditando.uid)}`,
          {
            method: "PUT",
            body: JSON.stringify(dados),
          }
        );
      } else {
        await requisicao("/api/usuarios", {
          method: "POST",
          body: JSON.stringify(dados),
        });
      }

      setModalUsuario(false);

      await carregarDados();
    } catch (error) {
      console.error("Erro ao salvar usuário:", error);
      setErro(error.message);
    } finally {
      setSalvando(false);
    }
  }

  // ========================================
  // FORMULÁRIO DE PERFIL
  // ========================================

  function atualizarCampoPerfil(campo, valor) {
    setFormPerfil((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  }

  function abrirNovoPerfil() {
    setPerfilEditando(null);

    setFormPerfil({
      nome: "",
      descricao: "",
      permissoes: criarPermissoes(),
    });

    setErro("");
    setModalPerfil(true);
  }

  function abrirEditarPerfil(item) {
    setPerfilEditando(item);

    setFormPerfil({
      nome: item.nome || "",
      descricao: item.descricao || "",
      permissoes: criarPermissoes(item.permissoes),
    });

    setErro("");
    setModalPerfil(true);
  }

  function alterarPermissao(modulo, campo, valor) {
    setFormPerfil((atual) => ({
      ...atual,
      permissoes: {
        ...atual.permissoes,
        [modulo]: {
          ...PERMISSOES_INICIAIS,
          ...(atual.permissoes[modulo] || {}),
          [campo]: valor,
        },
      },
    }));
  }

  async function salvarPerfil(evento) {
    evento.preventDefault();
    setErro("");

    if (!formPerfil.nome.trim()) {
      setErro("Informe o nome do perfil.");
      return;
    }

    setSalvando(true);

    try {
      const dados = {
        nome: formPerfil.nome.trim(),
        descricao: formPerfil.descricao.trim(),
        permissoes: criarPermissoes(
          formPerfil.permissoes
        ),
      };

      if (perfilEditando?.id) {
        await requisicao(
          `/api/perfis/${encodeURIComponent(perfilEditando.id)}`,
          {
            method: "PUT",
            body: JSON.stringify(dados),
          }
        );
      } else {
        await requisicao("/api/perfis", {
          method: "POST",
          body: JSON.stringify(dados),
        });
      }

      setModalPerfil(false);

      await carregarDados();
    } catch (error) {
      console.error("Erro ao salvar perfil:", error);
      setErro(error.message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluirPerfil(perfil) {
    const confirmar = window.confirm(
      `Deseja excluir o perfil "${perfil.nome}"?`
    );

    if (!confirmar) return;

    try {
      await requisicao(
        `/api/perfis/${encodeURIComponent(perfil.id)}`,
        {
          method: "DELETE",
        }
      );

      await carregarDados();
    } catch (error) {
      alert(error.message);
    }
  }

  // ========================================
  // BLOQUEAR E REATIVAR USUÁRIO
  // ========================================

  async function alternarStatus(item) {
    if (!item.uid) {
      alert("Não foi possível identificar o usuário.");
      return;
    }

    const novoStatus = item.ativo === false;

    const confirmar = window.confirm(
      novoStatus
        ? `Deseja reativar o usuário ${item.email}?`
        : `Deseja bloquear o acesso de ${item.email}?`
    );

    if (!confirmar) return;

    try {
      await requisicao(
        `/api/usuarios/${encodeURIComponent(item.uid)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ativo: novoStatus,
          }),
        }
      );

      await carregarDados();
    } catch (error) {
      alert(error.message);
    }
  }

  function mudarAba(novaAba) {
    setAba(novaAba);
    setBusca("");
    setPagina(1);
    setErro("");
    setErroPerfis("");
  }

  // ========================================
  // TELA
  // ========================================

  return (
    <main className="usuarios-page">
      <header className="usuarios-header">
        <div>
          <h1>Usuários</h1>
          <p>Painel / Usuários</p>
        </div>
      </header>

      <nav className="usuarios-tabs">
        <button
          type="button"
          className={aba === "usuarios" ? "ativo" : ""}
          onClick={() => mudarAba("usuarios")}
        >
          <UsersIcon size={15} />
          Usuários
        </button>

        <button
          type="button"
          className={aba === "perfis" ? "ativo" : ""}
          onClick={() => mudarAba("perfis")}
        >
          <Lock size={14} />
          Perfis e Permissões
        </button>
      </nav>

      {/* ================================== */}
      {/* ABA USUÁRIOS */}
      {/* ================================== */}

      {aba === "usuarios" && (
        <section className="usuarios-painel">
          <div className="usuarios-filtros-status">
            <label>
              <input
                type="radio"
                checked={filtroStatus === "ativos"}
                onChange={() => {
                  setFiltroStatus("ativos");
                  setPagina(1);
                }}
              />
              Usuários ativos
            </label>

            <label>
              <input
                type="radio"
                checked={filtroStatus === "inativos"}
                onChange={() => {
                  setFiltroStatus("inativos");
                  setPagina(1);
                }}
              />
              Usuários inativos
            </label>

            <label>
              <input
                type="radio"
                checked={filtroStatus === "todos"}
                onChange={() => {
                  setFiltroStatus("todos");
                  setPagina(1);
                }}
              />
              Todos os usuários
            </label>
          </div>

          <div className="usuarios-toolbar">
            <div className="usuarios-limite">
              Mostrar

              <select
                value={limite}
                onChange={(e) => {
                  setLimite(Number(e.target.value));
                  setPagina(1);
                }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>

              registros
            </div>

            <div className="usuarios-toolbar-direita">
              <div className="usuarios-busca">
                <Search size={14} />

                <input
                  placeholder="Buscar usuário..."
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value);
                    setPagina(1);
                  }}
                />
              </div>

              <button
                type="button"
                className="usuarios-btn-principal"
                onClick={abrirNovoUsuario}
              >
                <Plus size={14} />
                Incluir Usuário
              </button>

              <button
                type="button"
                className="usuarios-btn-atualizar"
                onClick={carregarDados}
                title="Atualizar"
                disabled={carregando}
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          <div className="usuarios-info">
            Mostrando{" "}
            {listaAtual.length === 0
              ? 0
              : (paginaAtual - 1) * limite + 1}
            {" "}até{" "}
            {Math.min(
              paginaAtual * limite,
              listaAtual.length
            )}
            {" "}de {listaAtual.length} registros.
          </div>

          {erro && (
            <div className="usuarios-erro">
              {erro}
            </div>
          )}

          <div className="usuarios-tabela-scroll">
            <table className="usuarios-tabela">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Nome</th>
                  <th>Usuário</th>
                  <th>Perfil</th>
                  <th>Email</th>
                  <th>Último Acesso</th>
                  <th>Opções</th>
                </tr>
              </thead>

              <tbody>
                {carregando ? (
                  <tr>
                    <td colSpan="7">
                      Carregando usuários...
                    </td>
                  </tr>
                ) : itensPagina.length === 0 ? (
                  <tr>
                    <td colSpan="7">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                ) : (
                  itensPagina.map((item, index) => (
                    <tr key={item.uid || item.id}>
                      <td>
                        {(paginaAtual - 1) * limite + index + 1}
                      </td>

                      <td>{obterNomeUsuario(item)}</td>
                      <td>{item.usuario || "—"}</td>
                      <td>
                        {item.perfilNome || item.perfil || "—"}
                      </td>
                      <td>{item.email || "—"}</td>
                      <td>{formatarData(item.ultimoAcesso)}</td>

                      <td>
                        <div className="usuarios-acoes">
                          <button
                            type="button"
                            title="Editar usuário"
                            onClick={() => abrirEditarUsuario(item)}
                          >
                            <Pencil size={15} />
                          </button>

                          <button
                            type="button"
                            title={
                              item.ativo === false
                                ? "Reativar usuário"
                                : "Bloquear usuário"
                            }
                            onClick={() => alternarStatus(item)}
                          >
                            {item.ativo === false ? (
                              <ShieldCheck size={15} />
                            ) : (
                              <Ban size={15} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Paginacao
            pagina={paginaAtual}
            totalPaginas={totalPaginas}
            setPagina={setPagina}
          />
        </section>
      )}

      {/* ================================== */}
      {/* ABA PERFIS */}
      {/* ================================== */}

      {aba === "perfis" && (
        <section className="usuarios-painel">
          <div className="usuarios-toolbar">
            <div className="usuarios-info">
              Perfis e permissões cadastrados.
            </div>

            <div className="usuarios-toolbar-direita">
              <div className="usuarios-busca">
                <Search size={14} />

                <input
                  placeholder="Buscar perfil..."
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value);
                    setPagina(1);
                  }}
                />
              </div>

              <button
                type="button"
                className="usuarios-btn-principal"
                onClick={abrirNovoPerfil}
              >
                <Plus size={14} />
                Incluir Perfil
              </button>

              <button
                type="button"
                className="usuarios-btn-atualizar"
                onClick={carregarPerfis}
                title="Atualizar perfis"
                disabled={carregandoPerfis}
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          <div className="usuarios-info">
            Mostrando {listaAtual.length} perfis.
          </div>

          {erroPerfis && (
            <div className="usuarios-erro">
              Erro ao carregar perfis: {erroPerfis}
            </div>
          )}

          <div className="usuarios-tabela-scroll">
            <table className="usuarios-tabela">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Perfil</th>
                  <th>Descrição</th>
                  <th>Opções</th>
                </tr>
              </thead>

              <tbody>
                {carregandoPerfis ? (
                  <tr>
                    <td colSpan="4">
                      Carregando perfis...
                    </td>
                  </tr>
                ) : itensPagina.length === 0 ? (
                  <tr>
                    <td colSpan="4">
                      Nenhum perfil encontrado.
                    </td>
                  </tr>
                ) : (
                  itensPagina.map((item, index) => (
                    <tr key={item.id}>
                      <td>
                        {(paginaAtual - 1) * limite + index + 1}
                      </td>

                      <td>{item.nome}</td>
                      <td>{item.descricao || "—"}</td>

                      <td>
                        <div className="usuarios-acoes">
                          <button
                            type="button"
                            title="Editar perfil e permissões"
                            onClick={() => abrirEditarPerfil(item)}
                          >
                            <Pencil size={15} />
                          </button>

                          <button
                            type="button"
                            title="Excluir perfil"
                            onClick={() => excluirPerfil(item)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Paginacao
            pagina={paginaAtual}
            totalPaginas={totalPaginas}
            setPagina={setPagina}
          />
        </section>
      )}

      {/* ================================== */}
      {/* MODAL DE USUÁRIO */}
      {/* ================================== */}

      {modalUsuario && (
        <div className="usuarios-modal-fundo">
          <form
            className="usuarios-modal"
            onSubmit={salvarUsuario}
          >
            <header className="usuarios-modal-header">
              <h2>
                <Pencil size={15} />

                {usuarioEditando
                  ? "Editar Usuário"
                  : "Incluir Usuário"}
              </h2>

              <button
                type="button"
                onClick={() => setModalUsuario(false)}
              >
                <X size={17} />
              </button>
            </header>

            <div className="usuarios-modal-body">
              {erro && (
                <div className="usuarios-erro">
                  {erro}
                </div>
              )}

              <div className="usuarios-form-grid">
                <Campo
                  label="Primeiro Nome"
                  value={formUsuario.primeiroNome}
                  onChange={(v) =>
                    atualizarCampoUsuario("primeiroNome", v)
                  }
                />

                <Campo
                  label="Segundo Nome"
                  value={formUsuario.segundoNome}
                  onChange={(v) =>
                    atualizarCampoUsuario("segundoNome", v)
                  }
                />

                <Campo
                  label="E-mail"
                  type="email"
                  value={formUsuario.email}
                  onChange={(v) =>
                    atualizarCampoUsuario("email", v)
                  }
                />

                <Campo
                  label="Usuário"
                  value={formUsuario.usuario}
                  onChange={(v) =>
                    atualizarCampoUsuario("usuario", v)
                  }
                />

                {/* CAMPO PERFIL DE ACESSO */}
                <div className="usuarios-campo">
                  <label>Perfil de acesso</label>

                  <select
                    value={formUsuario.perfil}
                    onChange={(e) =>
                      atualizarCampoUsuario(
                        "perfil",
                        e.target.value
                      )
                    }
                    required
                    disabled={carregandoPerfis || perfis.length === 0}
                  >
                    <option value="">
                      {carregandoPerfis
                        ? "Carregando perfis..."
                        : perfis.length === 0
                          ? "Nenhum perfil disponível"
                          : "Selecione um perfil"}
                    </option>

                    {perfis.map((perfil) => (
                      <option
                        key={perfil.id}
                        value={perfil.id}
                      >
                        {perfil.nome}
                      </option>
                    ))}
                  </select>

                  {erroPerfis && (
                    <small className="usuarios-campo-erro">
                      {erroPerfis}
                    </small>
                  )}

                  {!carregandoPerfis &&
                    !erroPerfis &&
                    perfis.length === 0 && (
                      <small>
                        Cadastre primeiro um perfil na aba
                        Perfis e Permissões.
                      </small>
                    )}
                </div>

                <label className="usuarios-check">
                  <input
                    type="checkbox"
                    checked={formUsuario.ativo}
                    onChange={(e) =>
                      atualizarCampoUsuario(
                        "ativo",
                        e.target.checked
                      )
                    }
                  />

                  Usuário ativo
                </label>
              </div>

              {!usuarioEditando && (
                <p className="usuarios-aviso">
                  A conta será criada pelo backend. O usuário
                  receberá as permissões do perfil selecionado.
                </p>
              )}
            </div>

            <footer className="usuarios-modal-footer">
              <button
                type="button"
                className="usuarios-btn-secundario"
                onClick={() => setModalUsuario(false)}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="usuarios-btn-principal"
                disabled={
                  salvando ||
                  carregandoPerfis ||
                  perfis.length === 0
                }
              >
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </footer>
          </form>
        </div>
      )}

      {/* ================================== */}
      {/* MODAL DE PERFIL */}
      {/* ================================== */}

      {modalPerfil && (
        <div className="usuarios-modal-fundo">
          <form
            className="usuarios-modal usuarios-modal-largo"
            onSubmit={salvarPerfil}
          >
            <header className="usuarios-modal-header">
              <h2>
                <ShieldCheck size={16} />

                {perfilEditando
                  ? "Editar Perfil"
                  : "Incluir Perfil"}
              </h2>

              <button
                type="button"
                onClick={() => setModalPerfil(false)}
              >
                <X size={17} />
              </button>
            </header>

            <div className="usuarios-modal-body">
              {erro && (
                <div className="usuarios-erro">
                  {erro}
                </div>
              )}

              <div className="usuarios-form-grid">
                <Campo
                  label="Nome do Perfil"
                  value={formPerfil.nome}
                  onChange={(v) =>
                    atualizarCampoPerfil("nome", v)
                  }
                />

                <Campo
                  label="Descrição"
                  value={formPerfil.descricao}
                  onChange={(v) =>
                    atualizarCampoPerfil("descricao", v)
                  }
                />
              </div>

              <div className="usuarios-permissoes-titulo">
                <strong>Módulo</strong>
                <span>Visualizar</span>
                <span>Incluir</span>
                <span>Editar</span>
                <span>Excluir</span>
              </div>

              <div className="usuarios-permissoes-lista">
                {MODULOS.map((modulo) => (
                  <div
                    className="usuarios-permissao-linha"
                    key={modulo}
                  >
                    <strong>{modulo}</strong>

                    {ACOES.map((campo) => (
                      <label
                        key={campo}
                        title={`${campo} ${modulo}`}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(
                            formPerfil.permissoes[modulo]?.[campo]
                          )}
                          onChange={(e) =>
                            alterarPermissao(
                              modulo,
                              campo,
                              e.target.checked
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                ))}
              </div>

              <p className="usuarios-aviso">
                As permissões serão verificadas pelo backend.
                Esta tela configura os acessos, mas não concede
                acesso diretamente ao Firestore.
              </p>
            </div>

            <footer className="usuarios-modal-footer">
              <button
                type="button"
                className="usuarios-btn-secundario"
                onClick={() => setModalPerfil(false)}
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="usuarios-btn-principal"
                disabled={salvando}
              >
                {salvando
                  ? "Salvando..."
                  : "Salvar Perfil"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </main>
  );
}

// ========================================
// COMPONENTES AUXILIARES
// ========================================

function Campo({
  label,
  value,
  onChange,
  type = "text",
}) {
  return (
    <div className="usuarios-campo">
      <label>{label}</label>

      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
      />
    </div>
  );
}

function Paginacao({
  pagina,
  totalPaginas,
  setPagina,
}) {
  return (
    <footer className="usuarios-paginacao">
      <button
        type="button"
        disabled={pagina <= 1}
        onClick={() =>
          setPagina((p) => Math.max(1, p - 1))
        }
      >
        <ChevronLeft size={14} />
        Anterior
      </button>

      <span>
        {pagina} de {totalPaginas}
      </span>

      <button
        type="button"
        disabled={pagina >= totalPaginas}
        onClick={() =>
          setPagina((p) =>
            Math.min(totalPaginas, p + 1)
          )
        }
      >
        Próximo
        <ChevronRight size={14} />
      </button>
    </footer>
  );
}
