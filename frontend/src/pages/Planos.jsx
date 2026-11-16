
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

import {
  Plus,
  Pencil,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  RefreshCw,
  FileSpreadsheet,
  Printer,
} from "lucide-react";

import { db, auth } from "../config/firebase";
import { getIdToken, getIdTokenResult } from "firebase/auth";

const COLECAO = "planos";

const FORMULARIO_INICIAL = {
  nome: "",
  dependentes: 1,
  dependentesPlus: 0,
  valor: "",
  tipoCarteirinha: "Comum",
  modalidadeMensal: false,
  valorMensal: "",
  modalidadeAnual: true,
  valorParcelaAnual: "",
  parcelasAnuais: 12,
  ativo: true,
  descricao: "",
  beneficios: "",
};

const PLANOS_PADRAO = [
  {
    nome: "Plano Light",
    dependentes: 5,
    dependentesPlus: 0,
    valor: 39.9,
    tipoCarteirinha: "Comum",
    modalidadeMensal: true,
    valorMensal: 39.9,
    modalidadeAnual: true,
    valorParcelaAnual: 29.9,
    parcelasAnuais: 12,
    ativo: true,
    descricao: "Uma opção econômica para cuidar da saúde.",
    beneficios:
      "Titular + até 4 dependentes\nConsultas de R$ 39,90 a R$ 99,90\nDescontos em exames participantes\nAcesso à rede credenciada",
  },
  {
    nome: "Plano Plus",
    dependentes: 1,
    dependentesPlus: 0,
    valor: 79.9,
    tipoCarteirinha: "Gold Plus",
    modalidadeMensal: false,
    valorMensal: "",
    modalidadeAnual: true,
    valorParcelaAnual: 79.9,
    parcelasAnuais: 12,
    ativo: true,
    descricao: "Mais economia nas consultas do titular.",
    beneficios:
      "Plano individual para o titular\nConsultas por R$ 9,90 nas especialidades participantes\nDescontos em exames participantes\nAcesso à rede credenciada",
  },
];

function dinheiro(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function valorNumerico(valor) {
  if (valor === "" || valor === null || valor === undefined) {
    return 0;
  }

  const numero = Number(String(valor).replace(",", "."));
  return Number.isFinite(numero) ? numero : 0;
}

function formatarValor(valor) {
  return valor === "" ? "" : String(valor).replace(".", ",");
}

function validarPlano(formulario) {
  if (!formulario.nome.trim()) {
    return "Informe o nome do plano.";
  }

  if (
    formulario.modalidadeMensal &&
    valorNumerico(formulario.valorMensal) <= 0
  ) {
    return "Informe um valor mensal válido.";
  }

  if (
    formulario.modalidadeAnual &&
    valorNumerico(formulario.valorParcelaAnual) <= 0
  ) {
    return "Informe o valor da parcela anual.";
  }

  if (
    !formulario.modalidadeMensal &&
    !formulario.modalidadeAnual
  ) {
    return "Selecione pelo menos uma modalidade de pagamento.";
  }

  if (
    formulario.modalidadeAnual &&
    Number(formulario.parcelasAnuais) < 1
  ) {
    return "Informe a quantidade de parcelas.";
  }

  return "";
}

export default function Planos() {
  const [planos, setPlanos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [limite, setLimite] = useState(10);

  const [modalAberto, setModalAberto] = useState(false);
  const [planoEditando, setPlanoEditando] = useState(null);
  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL);
  const [ehAdministrador, setEhAdministrador] = useState(false);
  const [verificandoPermissao, setVerificandoPermissao] = useState(true);

  // A autorização vem da custom claim definida pelo Firebase Admin SDK.
  // O navegador apenas consulta a claim; nunca concede admin a si próprio.
  const verificarAdministrador = async (forcarAtualizacao = false) => {
    const usuario = auth.currentUser;

    if (!usuario) {
      setEhAdministrador(false);
      throw new Error("Faça login para acessar os planos.");
    }

    if (forcarAtualizacao) {
      await getIdToken(usuario, true);
    }

    const resultadoToken = await getIdTokenResult(usuario);
    const autorizado = resultadoToken.claims.admin === true;
    setEhAdministrador(autorizado);

    if (!autorizado) {
      throw new Error(
        "Acesso negado. Esta operação exige uma conta administradora. Saia e entre novamente após receber a permissão."
      );
    }

    return true;
  };

  const carregarPlanos = async () => {
    setCarregando(true);
    setErro("");

    try {
      const usuario = auth.currentUser;
      if (!usuario) throw new Error("Faça login para consultar os planos.");

      // Atualiza o token para que o Firestore receba a claim admin mais recente.
      await getIdToken(usuario, true);
      const referencia = collection(db, COLECAO);
      const resultado = await getDocs(referencia);

      const lista = resultado.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));

      lista.sort((a, b) =>
        String(a.nome || a.planoNome || "").localeCompare(
          String(b.nome || b.planoNome || ""),
          "pt-BR"
        )
      );

      setPlanos(lista);
    } catch (error) {
      console.error("Erro ao carregar planos:", error);
      setErro(
        "Não foi possível carregar os planos. Verifique a conexão e as permissões do Firebase."
      );
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    let ativo = true;

    async function iniciar() {
      setVerificandoPermissao(true);
      try {
        await verificarAdministrador(true);
        if (ativo) await carregarPlanos();
      } catch (error) {
        console.error("Falha na autorização da tela Planos:", error);
        if (ativo) {
          setEhAdministrador(false);
          setErro(error.message || "Não foi possível validar sua permissão.");
          setCarregando(false);
        }
      } finally {
        if (ativo) setVerificandoPermissao(false);
      }
    }

    iniciar();

    return () => {
      ativo = false;
    };
  }, []);

  const planosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) return planos;

    return planos.filter((plano) => {
      const nome = String(
        plano.nome || plano.planoNome || ""
      ).toLowerCase();

      const tipo = String(
        plano.tipoCarteirinha || ""
      ).toLowerCase();

      return nome.includes(termo) || tipo.includes(termo);
    });
  }, [planos, busca]);

  const totalPaginas = Math.max(
    1,
    Math.ceil(planosFiltrados.length / limite)
  );

  const paginaAtual = Math.min(pagina, totalPaginas);

  const planosPagina = planosFiltrados.slice(
    (paginaAtual - 1) * limite,
    paginaAtual * limite
  );

  const totalAtivos = planos.filter(
    (plano) => plano.ativo !== false
  ).length;

  function abrirNovoPlano() {
    setPlanoEditando(null);
    setFormulario(FORMULARIO_INICIAL);
    setErro("");
    setModalAberto(true);
  }

  function abrirEdicao(plano) {
    setPlanoEditando(plano);

    setFormulario({
      nome: plano.nome || plano.planoNome || "",
      dependentes: plano.dependentes ?? 1,
      dependentesPlus: plano.dependentesPlus ?? 0,
      valor: plano.valor ?? "",
      tipoCarteirinha: plano.tipoCarteirinha || "Comum",
      modalidadeMensal:
        plano.modalidadeMensal ??
        valorNumerico(plano.valorMensal) > 0,
      valorMensal: plano.valorMensal ?? "",
      modalidadeAnual:
        plano.modalidadeAnual ??
        valorNumerico(plano.valorParcelaAnual || plano.valor) > 0,
      valorParcelaAnual:
        plano.valorParcelaAnual ?? plano.valor ?? "",
      parcelasAnuais: plano.parcelasAnuais ?? 12,
      ativo: plano.ativo !== false,
      descricao: plano.descricao || "",
      beneficios: plano.beneficios || "",
    });

    setErro("");
    setModalAberto(true);
  }

  function alterarCampo(campo, valor) {
    setFormulario((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  }

  async function salvarPlano(evento) {
    evento.preventDefault();

    const mensagemValidacao = validarPlano(formulario);

    if (mensagemValidacao) {
      setErro(mensagemValidacao);
      return;
    }

    setSalvando(true);
    setErro("");

    try {
      await verificarAdministrador(true);

      const valorMensal = formulario.modalidadeMensal
        ? valorNumerico(formulario.valorMensal)
        : null;

      const valorParcelaAnual = formulario.modalidadeAnual
        ? valorNumerico(formulario.valorParcelaAnual)
        : null;

      const quantidadeParcelas = formulario.modalidadeAnual
        ? Number(formulario.parcelasAnuais)
        : 0;

      const dados = {
        nome: formulario.nome.trim(),
        planoNome: formulario.nome.trim(),

        dependentes: Number(formulario.dependentes || 0),
        dependentesPlus: Number(formulario.dependentesPlus || 0),

        valor: formulario.modalidadeMensal
          ? valorMensal
          : valorParcelaAnual,

        tipoCarteirinha: formulario.tipoCarteirinha,

        modalidadeMensal: formulario.modalidadeMensal,
        valorMensal,

        modalidadeAnual: formulario.modalidadeAnual,
        valorParcelaAnual,
        parcelasAnuais: quantidadeParcelas,

        totalAnual:
          formulario.modalidadeAnual
            ? Number(
                (valorParcelaAnual * quantidadeParcelas).toFixed(2)
              )
            : null,

        ativo: Boolean(formulario.ativo),
        descricao: formulario.descricao.trim(),
        beneficios: formulario.beneficios.trim(),

        atualizadoEm: serverTimestamp(),
      };

      if (planoEditando?.id) {
        await updateDoc(
          doc(db, COLECAO, planoEditando.id),
          dados
        );
      } else {
        await addDoc(collection(db, COLECAO), {
          ...dados,
          criadoEm: serverTimestamp(),
        });
      }

      setModalAberto(false);
      setPlanoEditando(null);
      setFormulario(FORMULARIO_INICIAL);

      await carregarPlanos();
    } catch (error) {
      console.error("Erro ao salvar plano:", error);
      setErro(
        "Não foi possível salvar o plano. Verifique as permissões do Firebase."
      );
    } finally {
      setSalvando(false);
    }
  }

  async function excluirPlano(plano) {
    const nome = plano.nome || plano.planoNome || "este plano";

    const confirmar = window.confirm(
      `Deseja realmente excluir "${nome}"?\n\nEssa ação não poderá ser desfeita.`
    );

    if (!confirmar) return;

    try {
      await verificarAdministrador(true);
      await deleteDoc(doc(db, COLECAO, plano.id));
      await carregarPlanos();
    } catch (error) {
      console.error("Erro ao excluir plano:", error);
      alert("Não foi possível excluir o plano.");
    }
  }

  async function alternarAtivo(plano) {
    try {
      await verificarAdministrador(true);
      await updateDoc(doc(db, COLECAO, plano.id), {
        ativo: plano.ativo === false,
        atualizadoEm: serverTimestamp(),
      });

      await carregarPlanos();
    } catch (error) {
      console.error("Erro ao alterar situação:", error);
      alert("Não foi possível alterar a situação do plano.");
    }
  }

  function exportarCSV() {
    const cabecalho = [
      "Código",
      "Plano",
      "Dependentes",
      "Dependentes Plus",
      "Valor mensal",
      "Valor parcela anual",
      "Parcelas anuais",
      "Carteirinha",
      "Ativo",
    ];

    const linhas = planosFiltrados.map((plano) => [
      plano.id,
      plano.nome || plano.planoNome || "",
      plano.dependentes ?? 0,
      plano.dependentesPlus ?? 0,
      plano.valorMensal ?? "",
      plano.valorParcelaAnual ?? "",
      plano.parcelasAnuais ?? "",
      plano.tipoCarteirinha || "",
      plano.ativo === false ? "Não" : "Sim",
    ]);

    const conteudo = [cabecalho, ...linhas]
      .map((linha) =>
        linha
          .map((valor) => `"${String(valor ?? "").replace(/"/g, '""')}"`)
          .join(";")
      )
      .join("\n");

    const arquivo = new Blob(
      ["\uFEFF" + conteudo],
      { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");

    link.href = url;
    link.download = "planos-doutor-de-todos.csv";
    link.click();

    URL.revokeObjectURL(url);
  }

  function imprimir() {
    window.print();
  }

  function preencherPlanosPadrao() {
    const confirmar = window.confirm(
      "Deseja cadastrar os planos LIGHT e PLUS oficiais?\n\nEsta ação somente será permitida se a coleção estiver vazia."
    );

    if (!confirmar || planos.length > 0) return;

    const cadastrar = async () => {
      setSalvando(true);

      try {
        await verificarAdministrador(true);

        // Evita duplicar planos padrão se a coleção já tiver documentos.
        const existentes = await getDocs(collection(db, COLECAO));
        if (!existentes.empty) {
          alert("Já existem planos cadastrados. Nenhum plano padrão foi duplicado.");
          return;
        }

        for (const plano of PLANOS_PADRAO) {
          await addDoc(collection(db, COLECAO), {
            ...plano,
            totalAnual: Number(
              (
                plano.valorParcelaAnual * plano.parcelasAnuais
              ).toFixed(2)
            ),
            criadoEm: serverTimestamp(),
            atualizadoEm: serverTimestamp(),
          });
        }

        await carregarPlanos();
      } catch (error) {
        console.error("Erro ao cadastrar planos padrão:", error);
        alert("Não foi possível cadastrar os planos padrão.");
      } finally {
        setSalvando(false);
      }
    };

    cadastrar();
  }

  return (
    <main className="pg-planos">
      <style>{`
        .pg-planos {
          width: 100%;
          min-height: 100%;
          padding: 20px;
          color: #334155;
          background: #f8fafc;
          font-family: Arial, Helvetica, sans-serif;
          box-sizing: border-box;
        }

        .pg-planos * {
          box-sizing: border-box;
        }

        .pg-planos-cabecalho {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 15px;
          margin-bottom: 20px;
        }

        .pg-planos-cabecalho h1 {
          margin: 0;
          font-size: 22px;
          font-weight: 600;
          color: #334155;
        }

        .pg-planos-cabecalho p {
          margin: 5px 0 0;
          color: #64748b;
          font-size: 12px;
        }

        .pg-planos-indicadores {
          display: grid;
          grid-template-columns: repeat(2, minmax(150px, 220px));
          gap: 12px;
          margin-bottom: 20px;
        }

        .pg-plano-indicador {
          padding: 14px 16px;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 5px;
        }

        .pg-plano-indicador span {
          display: block;
          color: #64748b;
          font-size: 12px;
        }

        .pg-plano-indicador strong {
          display: block;
          margin-top: 5px;
          color: #334155;
          font-size: 22px;
        }

        .pg-planos-tabela-painel {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          overflow: hidden;
        }

        .pg-planos-acoes-topo {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 12px;
        }

        .pg-planos-controles {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 7px;
          color: #64748b;
          font-size: 12px;
        }

        .pg-planos-controles input,
        .pg-planos-controles select {
          min-height: 29px;
          border: 1px solid #cbd5e1;
          border-radius: 3px;
          padding: 4px 7px;
          font-size: 12px;
          color: #334155;
          background: #fff;
        }

        .pg-planos-busca {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .pg-planos-busca input {
          width: 190px;
        }

        .pg-planos-botao {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 34px;
          padding: 7px 12px;
          border: 0;
          border-radius: 3px;
          background: #334a63;
          color: #fff;
          font-size: 12px;
          cursor: pointer;
        }

        .pg-planos-botao:hover {
          background: #24384e;
        }

        .pg-planos button:disabled {
          opacity: .55;
          cursor: not-allowed;
        }

        .pg-planos-botao:disabled {
          opacity: .6;
          cursor: not-allowed;
        }

        .pg-planos-botao-secundario {
          min-height: 28px;
          padding: 5px 8px;
          border: 1px solid #dbe2ea;
          border-radius: 3px;
          background: #fff;
          color: #475569;
          font-size: 11px;
          cursor: pointer;
        }

        .pg-planos-tabela-scroll {
          width: 100%;
          overflow-x: auto;
        }

        .pg-planos-tabela {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          text-align: center;
          white-space: nowrap;
        }

        .pg-planos-tabela th {
          padding: 10px 8px;
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #dbe2e8;
          font-weight: 600;
        }

        .pg-planos-tabela td {
          padding: 9px 8px;
          border: 1px solid #e2e8f0;
          color: #475569;
        }

        .pg-planos-tabela tbody tr:nth-child(even) {
          background: #f8fafc;
        }

        .pg-planos-tabela tbody tr:hover {
          background: #f1f5f9;
        }

        .pg-planos-acoes {
          display: flex;
          justify-content: center;
          gap: 8px;
        }

        .pg-planos-icone {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 0;
          background: transparent;
          color: #475569;
          cursor: pointer;
          padding: 3px;
        }

        .pg-planos-icone.editar:hover {
          color: #2563eb;
        }

        .pg-planos-icone.excluir:hover {
          color: #dc2626;
        }

        .pg-plano-situacao {
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 10px;
          font-weight: 600;
        }

        .pg-plano-situacao.ativo {
          background: #dcfce7;
          color: #166534;
        }

        .pg-plano-situacao.inativo {
          background: #fee2e2;
          color: #991b1b;
        }

        .pg-planos-rodape {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 10px;
          padding: 12px;
          color: #64748b;
          font-size: 11px;
        }

        .pg-planos-paginacao {
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .pg-planos-paginacao button {
          padding: 6px 9px;
          border: 1px solid #dbe2e8;
          border-radius: 3px;
          background: #fff;
          color: #475569;
          font-size: 11px;
          cursor: pointer;
        }

        .pg-planos-paginacao button:disabled {
          opacity: .4;
          cursor: not-allowed;
        }

        .pg-planos-erro {
          margin: 12px;
          padding: 10px;
          border: 1px solid #fecaca;
          border-radius: 4px;
          background: #fef2f2;
          color: #991b1b;
          font-size: 12px;
        }

        .pg-planos-vazio {
          padding: 35px 15px;
          text-align: center;
          color: #64748b;
          font-size: 13px;
        }

        .pg-modal-fundo {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 15px;
          background: rgba(0,0,0,.55);
        }

        .pg-modal {
          width: min(760px, 100%);
          max-height: 92vh;
          overflow-y: auto;
          background: #fff;
          border-radius: 4px;
          box-shadow: 0 10px 35px rgba(0,0,0,.25);
        }

        .pg-modal-cabecalho {
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          padding: 18px;
          border-bottom: 1px solid #e2e8f0;
        }

        .pg-modal-cabecalho h2 {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 7px;
          color: #475569;
          font-size: 16px;
          font-weight: 500;
        }

        .pg-modal-fechar {
          position: absolute;
          right: 12px;
          top: 12px;
          border: 0;
          background: transparent;
          color: #94a3b8;
          cursor: pointer;
        }

        .pg-modal-conteudo {
          padding: 20px 24px;
        }

        .pg-modal-grade {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }

        .pg-modal-campo {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .pg-modal-campo.largo {
          grid-column: 1 / -1;
        }

        .pg-modal-campo label {
          color: #475569;
          font-size: 11px;
          font-weight: 600;
        }

        .pg-modal-campo input,
        .pg-modal-campo select,
        .pg-modal-campo textarea {
          width: 100%;
          min-height: 34px;
          padding: 7px 9px;
          border: 1px solid #cbd5e1;
          border-radius: 3px;
          background: #fff;
          color: #475569;
          font-size: 12px;
          outline: none;
        }

        .pg-modal-campo textarea {
          min-height: 85px;
          resize: vertical;
        }

        .pg-modal-campo input:focus,
        .pg-modal-campo select:focus,
        .pg-modal-campo textarea:focus {
          border-color: #64748b;
        }

        .pg-modal-secao {
          grid-column: 1 / -1;
          margin-top: 5px;
          padding: 12px;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          background: #f8fafc;
        }

        .pg-modal-secao h3 {
          margin: 0 0 12px;
          font-size: 12px;
          color: #334155;
        }

        .pg-modal-check {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          color: #475569;
          font-size: 12px;
        }

        .pg-modal-check input {
          width: 15px;
          height: 15px;
        }

        .pg-modal-rodape {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 13px 20px;
          border-top: 1px solid #e2e8f0;
        }

        .pg-modal-erro {
          grid-column: 1 / -1;
          padding: 9px;
          border-radius: 3px;
          background: #fef2f2;
          color: #991b1b;
          font-size: 12px;
        }

        @media(max-width: 650px) {
          .pg-planos {
            padding: 12px;
          }

          .pg-planos-cabecalho {
            align-items: flex-start;
            flex-direction: column;
          }

          .pg-planos-indicadores {
            grid-template-columns: 1fr 1fr;
          }

          .pg-planos-acoes-topo {
            align-items: flex-start;
            flex-direction: column;
          }

          .pg-planos-busca input {
            width: 150px;
          }

          .pg-modal-grade {
            grid-template-columns: 1fr;
          }

          .pg-modal-campo.largo,
          .pg-modal-secao {
            grid-column: 1;
          }
        }

        @media print {
          .pg-planos-cabecalho button,
          .pg-planos-indicadores,
          .pg-planos-acoes-topo,
          .pg-planos-acoes,
          .pg-planos-rodape,
          .pg-modal-fundo {
            display: none !important;
          }

          .pg-planos {
            background: #fff;
            padding: 0;
          }
        }
      `}</style>

      <header className="pg-planos-cabecalho">
        <div>
          <h1>Planos</h1>
          <p>Gestão dos planos e condições comerciais.</p>
          <p>
            {verificandoPermissao
              ? "Verificando autorização..."
              : ehAdministrador
              ? "Acesso administrativo confirmado."
              : "Acesso somente para administradores."}
          </p>
        </div>

        <button
          className="pg-planos-botao"
          type="button"
          onClick={abrirNovoPlano}
          disabled={!ehAdministrador || verificandoPermissao}
        >
          <Plus size={15} />
          Incluir Plano
        </button>
      </header>

      <section className="pg-planos-indicadores">
        <div className="pg-plano-indicador">
          <span>Planos cadastrados</span>
          <strong>{planos.length}</strong>
        </div>

        <div className="pg-plano-indicador">
          <span>Planos ativos</span>
          <strong>{totalAtivos}</strong>
        </div>
      </section>

      <section className="pg-planos-tabela-painel">
        <div className="pg-planos-acoes-topo">
          <div className="pg-planos-controles">
            <span>Mostrar</span>

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

            <span>registros</span>
          </div>

          <div className="pg-planos-controles">
            <div className="pg-planos-busca">
              <Search size={14} />
              <span>Buscar:</span>
              <input
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPagina(1);
                }}
                placeholder="Buscar plano..."
              />
            </div>

            <button
              type="button"
              className="pg-planos-botao-secundario"
              onClick={exportarCSV}
            >
              <FileSpreadsheet size={12} /> CSV
            </button>

            <button
              type="button"
              className="pg-planos-botao-secundario"
              onClick={imprimir}
            >
              <Printer size={12} /> Imprimir
            </button>

            <button
              type="button"
              className="pg-planos-botao-secundario"
              onClick={carregarPlanos}
              title="Atualizar"
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>

        {erro && <div className="pg-planos-erro">{erro}</div>}

        {carregando ? (
          <div className="pg-planos-vazio">
            Carregando planos...
          </div>
        ) : planos.length === 0 ? (
          <div className="pg-planos-vazio">
            <strong>Nenhum plano cadastrado.</strong>
            <p>Cadastre os planos LIGHT e PLUS para começar.</p>

            <button
              type="button"
              className="pg-planos-botao"
              onClick={preencherPlanosPadrao}
              disabled={salvando || !ehAdministrador || verificandoPermissao}
            >
              Cadastrar LIGHT e PLUS oficiais
            </button>
          </div>
        ) : planosFiltrados.length === 0 ? (
          <div className="pg-planos-vazio">
            Nenhum plano encontrado para essa busca.
          </div>
        ) : (
          <div className="pg-planos-tabela-scroll">
            <table className="pg-planos-tabela">
              <thead>
                <tr>
                  <th>Cód.</th>
                  <th>Plano</th>
                  <th>Dependentes</th>
                  <th>Dependentes Plus</th>
                  <th>Valor</th>
                  <th>Carteirinha</th>
                  <th>Situação</th>
                  <th>Opções</th>
                </tr>
              </thead>

              <tbody>
                {planosPagina.map((plano) => (
                  <tr key={plano.id}>
                    <td>{plano.id.slice(0, 6)}</td>

                    <td>
                      {plano.nome || plano.planoNome || "Sem nome"}
                    </td>

                    <td>{plano.dependentes ?? 0}</td>

                    <td>{plano.dependentesPlus ?? 0}</td>

                    <td>
                      {dinheiro(
                        plano.valorMensal ??
                        plano.valor ??
                        plano.valorParcelaAnual
                      )}
                    </td>

                    <td>{plano.tipoCarteirinha || "Comum"}</td>

                    <td>
                      <button
                        type="button"
                        className={`pg-plano-situacao ${
                          plano.ativo === false ? "inativo" : "ativo"
                        }`}
                        onClick={() => alternarAtivo(plano)}
                        title="Clique para alterar a situação"
                      >
                        {plano.ativo === false ? "Inativo" : "Ativo"}
                      </button>
                    </td>

                    <td>
                      <div className="pg-planos-acoes">
                        <button
                          type="button"
                          className="pg-planos-icone editar"
                          title="Editar plano"
                          onClick={() => abrirEdicao(plano)}
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          type="button"
                          className="pg-planos-icone excluir"
                          title="Excluir plano"
                          onClick={() => excluirPlano(plano)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="pg-planos-rodape">
          <span>
            Mostrando {planosFiltrados.length === 0 ? 0 : (paginaAtual - 1) * limite + 1}
            {" "}até{" "}
            {Math.min(paginaAtual * limite, planosFiltrados.length)}
            {" "}de {planosFiltrados.length} registros.
          </span>

          <div className="pg-planos-paginacao">
            <button
              type="button"
              disabled={paginaAtual <= 1}
              onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
            >
              <ChevronLeft size={13} /> Anterior
            </button>

            <button type="button" disabled>
              {paginaAtual}
            </button>

            <button
              type="button"
              disabled={paginaAtual >= totalPaginas}
              onClick={() =>
                setPagina((atual) => Math.min(totalPaginas, atual + 1))
              }
            >
              Próximo <ChevronRight size={13} />
            </button>
          </div>
        </footer>
      </section>

      {modalAberto && (
        <div
          className="pg-modal-fundo"
          onMouseDown={(evento) => {
            if (evento.target === evento.currentTarget && !salvando) {
              setModalAberto(false);
            }
          }}
        >
          <section
            className="pg-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-modal-plano"
          >
            <header className="pg-modal-cabecalho">
              <h2 id="titulo-modal-plano">
                <Pencil size={15} />
                {planoEditando ? "Editar Plano" : "Incluir Plano"}
              </h2>

              <button
                type="button"
                className="pg-modal-fechar"
                onClick={() => setModalAberto(false)}
                disabled={salvando}
              >
                <X size={17} />
              </button>
            </header>

            <form onSubmit={salvarPlano}>
              <div className="pg-modal-conteudo">
                <div className="pg-modal-grade">
                  {erro && (
                    <div className="pg-modal-erro">{erro}</div>
                  )}

                  <div className="pg-modal-campo">
                    <label>Plano</label>
                    <input
                      value={formulario.nome}
                      onChange={(e) =>
                        alterarCampo("nome", e.target.value)
                      }
                      placeholder="Nome do plano"
                      required
                    />
                  </div>

                  <div className="pg-modal-campo">
                    <label>Tipo de carteirinha</label>
                    <select
                      value={formulario.tipoCarteirinha}
                      onChange={(e) =>
                        alterarCampo("tipoCarteirinha", e.target.value)
                      }
                    >
                      <option value="Comum">Comum</option>
                      <option value="Gold Plus">Gold Plus</option>
                    </select>
                  </div>

                  <div className="pg-modal-campo">
                    <label>Dependentes (incluindo titular)</label>
                    <input
                      type="number"
                      min="1"
                      value={formulario.dependentes}
                      onChange={(e) =>
                        alterarCampo("dependentes", e.target.value)
                      }
                    />
                  </div>

                  <div className="pg-modal-campo">
                    <label>Dependentes Plus</label>
                    <input
                      type="number"
                      min="0"
                      value={formulario.dependentesPlus}
                      onChange={(e) =>
                        alterarCampo("dependentesPlus", e.target.value)
                      }
                    />
                  </div>

                  <div className="pg-modal-secao">
                    <h3>Condições comerciais</h3>

                    <label className="pg-modal-check">
                      <input
                        type="checkbox"
                        checked={formulario.modalidadeMensal}
                        onChange={(e) =>
                          alterarCampo("modalidadeMensal", e.target.checked)
                        }
                      />
                      Permitir pagamento mensal
                    </label>

                    {formulario.modalidadeMensal && (
                      <div className="pg-modal-campo">
                        <label>Valor mensal (R$)</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={formulario.valorMensal}
                          onChange={(e) =>
                            alterarCampo("valorMensal", e.target.value)
                          }
                          placeholder="Ex.: 39,90"
                        />
                      </div>
                    )}

                    <label
                      className="pg-modal-check"
                      style={{ marginTop: 15 }}
                    >
                      <input
                        type="checkbox"
                        checked={formulario.modalidadeAnual}
                        onChange={(e) =>
                          alterarCampo("modalidadeAnual", e.target.checked)
                        }
                      />
                      Permitir contratação anual parcelada
                    </label>

                    {formulario.modalidadeAnual && (
                      <div className="pg-modal-grade">
                        <div className="pg-modal-campo">
                          <label>Valor de cada parcela (R$)</label>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={formulario.valorParcelaAnual}
                            onChange={(e) =>
                              alterarCampo(
                                "valorParcelaAnual",
                                e.target.value
                              )
                            }
                            placeholder="Ex.: 29,90"
                          />
                        </div>

                        <div className="pg-modal-campo">
                          <label>Quantidade de parcelas</label>
                          <input
                            type="number"
                            min="1"
                            max="12"
                            value={formulario.parcelasAnuais}
                            onChange={(e) =>
                              alterarCampo("parcelasAnuais", e.target.value)
                            }
                          />
                        </div>

                        <div className="pg-modal-campo largo">
                          <label>Total da contratação anual</label>
                          <input
                            readOnly
                            value={dinheiro(
                              valorNumerico(formulario.valorParcelaAnual) *
                              Number(formulario.parcelasAnuais || 0)
                            )}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pg-modal-campo largo">
                    <label>Descrição</label>
                    <input
                      value={formulario.descricao}
                      onChange={(e) =>
                        alterarCampo("descricao", e.target.value)
                      }
                      placeholder="Descrição resumida do plano"
                    />
                  </div>

                  <div className="pg-modal-campo largo">
                    <label>Benefícios (um por linha)</label>
                    <textarea
                      value={formulario.beneficios}
                      onChange={(e) =>
                        alterarCampo("beneficios", e.target.value)
                      }
                      placeholder="Informe os benefícios do plano..."
                    />
                  </div>

                  <div className="pg-modal-campo largo">
                    <label className="pg-modal-check">
                      <input
                        type="checkbox"
                        checked={formulario.ativo}
                        onChange={(e) =>
                          alterarCampo("ativo", e.target.checked)
                        }
                      />
                      Plano ativo e disponível para venda
                    </label>
                  </div>
                </div>
              </div>

              <footer className="pg-modal-rodape">
                <button
                  type="button"
                  className="pg-planos-botao-secundario"
                  onClick={() => setModalAberto(false)}
                  disabled={salvando}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  className="pg-planos-botao"
                  disabled={salvando}
                >
                  {salvando
                    ? "Salvando..."
                    : planoEditando
                    ? "Salvar alterações"
                    : "Incluir Plano"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
