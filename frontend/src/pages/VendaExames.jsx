import React, { useEffect, useMemo, useState } from "react";

import {

  addDoc, collection, doc, getDoc, getDocs, limit, onSnapshot, query, serverTimestamp,

} from "firebase/firestore";

import { getAuth } from "firebase/auth";

import {

  Search, UserRound, UserPlus, MapPin, Phone, Plus, Trash2,

  FileText, CreditCard, Printer, AlertCircle, Stethoscope,

  ClipboardList, X, RefreshCw, Map,

} from "lucide-react";

import { db } from "../config/firebase";

import catalogoExames from "../data/catalogoExames";

import logotipo from "../assets/logotipo.jpg";

import "./VendaExames.css";

const moeda = (v) => {

  const n = Number(v);

  return Number.isFinite(n)

    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

    : "Não informado";

};

const numeros = (v) => String(v || "").replace(/\D/g, "");

const normalizar = (v) => String(v || "").trim().toLocaleLowerCase("pt-BR")

  .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const campoNome = (c) => c?.nomeCompleto || c?.nome || c?.razaoSocial || "Cliente sem nome";

const campoCpf = (c) => c?.cpf || c?.documento || c?.cpfCnpj || "";

// A guia só pode ser emitida após confirmação registrada pelo webhook no Firestore.
const pagamentoEstaConfirmado = (venda) =>
  venda?.pagamentoConfirmado === true && normalizar(venda?.statusPagamento) === "pago";

const campo = (obj, letra) => obj?.colunas?.[letra]?.valor_calculado ?? obj?.colunas?.[letra]?.original ?? null;

const valorNumerico = (v) => {

  if (typeof v === "number") return v;

  if (typeof v !== "string") return null;

  const limpo = v.trim().replace(/[R$\s]/g, "").replace(/\*\*.\*\*/g, "").replace(",", ".");

  if (!limpo || limpo.startsWith("=")) return null;

  const n = Number(limpo);

  return Number.isFinite(n) ? n : null;

};

const listaUnica = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));

// Agrupamentos de proximidade para ampliar a busca quando a cidade não possui

// procedimento próprio. São faixas regionais de atendimento, não distâncias em km.

const GRUPOS_PROXIMIDADE = [

  { cidades: ["osasco", "carapicuiba", "barueri", "jandira", "itapevi", "cotia", "santana de parnaiba", "pirapora do bom jesus", "embu das artes", "taboao da serra", "sao paulo", "lapa", "barra funda" ] },

  { cidades: ["jundiai", "varzea paulista", "campo limpo paulista", "itupeva", "louveira", "vinhedo", "cabreuva"] },

  { cidades: ["santo andre", "sao bernardo do campo", "sao caetano do sul", "diadema", "maua", "ribeirao pires", "rio grande da serra"] },

  { cidades: ["guarulhos", "aruja", "itaquaquecetuba", "poa", "suzano", "ferraz de vasconcelos", "mogi das cruzes"] },

  { cidades: ["santana", "tucuruvi", "tremembe", "jaçana", "jacana", "vila maria", "vila guilherme", "sao paulo"] },

];

const chaveLocal = (v) => normalizar(v).replace(/\b(sp|sao paulo)\b/g, (m) => m === "sp" ? "sao paulo" : m).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const cidadesConhecidas = [...new Set(GRUPOS_PROXIMIDADE.flatMap((g) => g.cidades))].sort((a,b)=>b.length-a.length);

const cidadesNoEndereco = (enderecos = []) => {

  const texto = normalizar(enderecos.join(" "));

  return cidadesConhecidas.filter((cidade) => {

    const escaped = cidade.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(texto);

  });

};

const cidadesDoProcedimento = (p) => [...new Set([

  ...(p.cidade_clinica || []).map(chaveLocal),

  ...cidadesNoEndereco(p.enderecos || []),

].filter(Boolean))];

const nomePrestadorCombina = (nomeCatalogo, nomeMenu) => {

  const a = chaveLocal(nomeCatalogo).replace(/\s+/g, "");

  const b = chaveLocal(String(nomeMenu || "").split(" - ")[0]).replace(/\s+/g, "");

  if (!a || !b) return false;

  if (a.includes(b) || b.includes(a)) return true;

  const prefixo = Math.min(7, a.length, b.length);

  return prefixo >= 5 && a.slice(0, prefixo) === b.slice(0, prefixo);

};

const grupoDaLocalidade = (local) => {

  const alvo = chaveLocal(local);

  return GRUPOS_PROXIMIDADE.find((g) => g.cidades.includes(alvo)) || null;

};

function extrairCliente(snap) {

  return { id: snap.id, ...snap.data() };

}

function imprimirGuia(venda, cliente) {

  if (!pagamentoEstaConfirmado(venda)) return;

  const escape = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({

    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",

  }[c]));

  const linhas = (venda.itens || []).map((i) =>

    `<tr><td>${escape(i.exameNome)}</td><td>${escape(i.clinicaNome)}</td><td>${escape(i.endereco || (Array.isArray(i.enderecos) ? i.enderecos.join(" | ") : ""))}</td></tr>`

  ).join("");

  const w = window.open("", "_blank", "width=900,height=700");

  if (!w) return;

  w.document.write(`<!doctype html><html><head><title>Guia de autorização</title>

    <style>body{font:14px Arial;padding:36px;color:#1e293b}h1{color:#1d4b70}

    table{width:100%;border-collapse:collapse;margin-top:24px}td,th{padding:12px;border:1px solid #cbd5e1;text-align:left}

    .muted{color:#64748b}.assinatura{margin-top:70px;border-top:1px solid #64748b;width:280px;padding-top:8px}</style>

    </head><body><h1>Doutor Saúde Familiar</h1><h2>Guia de autorização de exames</h2>

    <p><b>Guia:</b> ${escape(venda.id)}<br><b>Cliente:</b> ${escape(campoNome(cliente))}

    <br><b>CPF:</b> ${escape(campoCpf(cliente))}<br><b>Data:</b> ${new Date().toLocaleDateString("pt-BR")}</p>

    <table><thead><tr><th>Exame</th><th>Clínica</th><th>Endereço</th></tr></thead><tbody>${linhas}</tbody></table>

    <p><b>Total pago:</b> ${moeda(venda.valorTotal)}</p>

    <p class="muted">Apresente esta guia à unidade indicada. Confirme o agendamento diretamente com a clínica.</p>

    <div class="assinatura">Assinatura / validação</div><script>window.onload=()=>window.print()</script></body></html>`);

  w.document.close();

}

export default function VendaExames({ usuario, onNavigate, onCriarCheckoutExame, vendaExameRetorno = null }) {

  const [busca, setBusca] = useState("");

  const [buscando, setBuscando] = useState(false);

  const [cliente, setCliente] = useState(null);

  const [contratoVinculado, setContratoVinculado] = useState(null);

  const [erroBusca, setErroBusca] = useState("");

  const [cidadeRegiao, setCidadeRegiao] = useState("");

  const [filtroExame, setFiltroExame] = useState("");

  const [clinicaSelecionada, setClinicaSelecionada] = useState("");

  const [exameSelecionado, setExameSelecionado] = useState("");

  const [carrinho, setCarrinho] = useState([]);

  const [salvando, setSalvando] = useState(false);

  const [mensagem, setMensagem] = useState("");

  const [vendaAtual, setVendaAtual] = useState(null);

  const [checkoutInfo, setCheckoutInfo] = useState(null);
  const [modalPagamentoAberto, setModalPagamentoAberto] = useState(false);

  const [tipoDesconto, setTipoDesconto] = useState("percentual");

  const [valorDesconto, setValorDesconto] = useState("");

  // Restaura a venda que abriu o checkout ao voltar para esta tela.

  // O status real é relido do Firestore; o frontend não presume pagamento.

  useEffect(() => {

    if (!vendaExameRetorno?.vendaId) return;

    let ativo = true;

    setCliente(vendaExameRetorno.cliente || null);

    setContratoVinculado(

      vendaExameRetorno.contratoId

        ? { id: vendaExameRetorno.contratoId }

        : null

    );

    setCarrinho(vendaExameRetorno.itens || []);

    setVendaAtual({

      id: vendaExameRetorno.vendaId,

      ...vendaExameRetorno,

      pagamentoConfirmado: false,

      statusPagamento: "Aguardando pagamento",

    });

    getDoc(doc(db, "vendasExames", String(vendaExameRetorno.vendaId)))

      .then((snap) => {

        if (ativo && snap.exists()) {

          const vendaSalva = snap.data();

          setCarrinho(vendaSalva.itens || vendaExameRetorno.itens || []);

          setVendaAtual({ id: snap.id, ...vendaSalva });
          if (pagamentoEstaConfirmado(vendaSalva)) setModalPagamentoAberto(true);

        }

      })

      .catch((error) => {

        console.error("Erro ao restaurar venda de exames:", error);

      });

    return () => {

      ativo = false;

    };

  }, [vendaExameRetorno?.vendaId]);

  // Acompanha em tempo real a confirmação do webhook enquanto a tela de venda estiver aberta.

  useEffect(() => {

    // Acompanha tanto a venda recém-criada nesta tela quanto a venda
    // restaurada quando o usuário retorna do checkout.
    const vendaId = vendaAtual?.id || vendaExameRetorno?.vendaId;
    if (!vendaId) return;

    const referencia = doc(db, "vendasExames", String(vendaId));

    const cancelar = onSnapshot(referencia, (snap) => {

      if (!snap.exists()) return;

      const dados = snap.data();

      const venda = { id: snap.id, ...dados };

      setVendaAtual(venda);

      if (Array.isArray(dados.itens)) setCarrinho(dados.itens);

      if (pagamentoEstaConfirmado(dados)) {

        setModalPagamentoAberto(true);

        setMensagem("Pagamento confirmado! Sua guia está liberada para emissão.");

      }

    }, (error) => {

      console.error("Erro ao acompanhar confirmação do pagamento:", error);

    });

    return () => cancelar();

  }, [vendaAtual?.id, vendaExameRetorno?.vendaId]);

  const procedimentos = Array.isArray(catalogoExames?.procedimentos) ? catalogoExames.procedimentos : [];

  const regioesMenu = Array.isArray(catalogoExames?.regioes_menu) ? catalogoExames.regioes_menu : [];

  const cidadesDisponiveis = useMemo(() => listaUnica([

    ...procedimentos.flatMap((p) => p.cidade_clinica || []),

    ...regioesMenu.map((r) => r.cidade_ou_bairro),

  ]), [procedimentos, regioesMenu]);

  const regioesDisponiveis = useMemo(() => listaUnica(regioesMenu.map((r) => r.regiao)), [regioesMenu]);

  const buscarCliente = async (e) => {

    e?.preventDefault();

    const termo = busca.trim();

    if (termo.length < 3) {

      setErroBusca("Digite pelo menos 3 caracteres ou informe o CPF completo.");

      return;

    }

    setBuscando(true);

    setErroBusca("");

    setCliente(null);

    setContratoVinculado(null);

    setCarrinho([]);

    setVendaAtual(null);

    try {

      const [clientesSnap, contratosSnap] = await Promise.all([

        getDocs(query(collection(db, "clientes"), limit(1000))),

        getDocs(query(collection(db, "contratos"), limit(2000))),

      ]);

      const cpfBusca = numeros(termo);

      const termoNome = normalizar(termo);

      const clientes = clientesSnap.docs.map(extrairCliente);

      let encontrado = clientes.find((c) => cpfBusca.length === 11 && numeros(campoCpf(c)) === cpfBusca);

      if (!encontrado) encontrado = clientes.find((c) => normalizar(campoNome(c)) === termoNome);

      if (!encontrado) encontrado = clientes.find((c) => normalizar(campoNome(c)).includes(termoNome));

      const contratos = contratosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      let contrato = encontrado

        ? contratos.find((c) => c.clienteId === encontrado.id) || null

        : null;

      if (!encontrado) {

        contrato = contratos.find((c) =>

          (cpfBusca.length === 11 && numeros(c.clienteCPF || c.cpf) === cpfBusca)

          || normalizar(c.clienteNome || c.nomeCompleto).includes(termoNome)

        ) || null;

        if (contrato?.clienteId) encontrado = clientes.find((c) => c.id === contrato.clienteId) || null;

      }

      if (!encontrado) {

        setErroBusca("Cliente não encontrado. Cadastre primeiro em Novo Cliente → Cadastro de Cliente e depois retorne a esta tela.");

        return;

      }

      setCliente(encontrado);

      setContratoVinculado(contrato);

    } catch (err) {

      console.error("Erro ao buscar cliente:", err);

      setErroBusca("Erro ao consultar clientes e contratos. Verifique as permissões do Firestore.");

    } finally {

      setBuscando(false);

    }

  };

  // Busca em três camadas: cidade/bairro exato, localidades do mesmo eixo

  // regional e, por último, os prestadores vizinhos cadastrados no MENU.

  const prestadoresDaRegiao = useMemo(() => {

    const termo = chaveLocal(cidadeRegiao);

    if (!termo) return [];

    const grupo = grupoDaLocalidade(termo);

    return regioesMenu.filter((r) => {

      const cidadeMenu = chaveLocal(r.cidade_ou_bairro);

      const regiaoMenu = chaveLocal(r.regiao);

      return cidadeMenu === termo || regiaoMenu === termo || (grupo && grupo.cidades.includes(cidadeMenu));

    });

  }, [cidadeRegiao, regioesMenu]);

  const catalogoRegional = useMemo(() => {

    const termo = chaveLocal(cidadeRegiao);

    if (!termo) return [];

    const grupo = grupoDaLocalidade(termo);

    const menusDaBusca = regioesMenu.filter((r) => {

      const cidadeMenu = chaveLocal(r.cidade_ou_bairro);

      return cidadeMenu === termo || (grupo && grupo.cidades.includes(cidadeMenu));

    });

    const menusDaRegiao = regioesMenu.filter((r) => chaveLocal(r.regiao) === termo);

    const menusConsiderados = [...menusDaBusca, ...menusDaRegiao];

    const resultados = procedimentos.map((p) => {

      const cidades = cidadesDoProcedimento(p);

      const menusCorrespondentes = menusConsiderados.filter((r) => nomePrestadorCombina(p.clinica, r.clinica_e_servico));

      const cidadesMenu = menusCorrespondentes.map((r) => chaveLocal(r.cidade_ou_bairro));

      const localidades = [...new Set([...cidades, ...cidadesMenu])];

      let nivel = 99;

      if (localidades.includes(termo) || cidades.includes(termo)) nivel = 0;

      else if (menusCorrespondentes.some((r) => chaveLocal(r.cidade_ou_bairro) === termo)) nivel = 0;

      else if (grupo && localidades.some((c) => grupo.cidades.includes(c) && c !== "sao paulo")) nivel = 1;

      else if (menusDaRegiao.length && menusCorrespondentes.length) nivel = 2;

      // A busca por nome de cidade também reconhece endereço de unidade

      // mesmo quando a coluna cidade_clinica está vazia ou desatualizada.

      if (nivel === 99) return null;

      const cidadeExibicao = localidades.find((c) => c === termo)

        || localidades.find((c) => grupo && grupo.cidades.includes(c) && c !== "sao paulo")

        || localidades[0] || "Localidade não identificada";

      return { ...p, _nivelProximidade: nivel, _localidadeEncontrada: cidadeExibicao,

        _localidadesEncontradas: localidades, _menusCorrespondentes: menusCorrespondentes };

    }).filter(Boolean);

    // Se a busca é por uma região ampla (ex.: Zona Oeste), o MENU é a fonte

    // principal. Se é por cidade, os vizinhos entram depois dos resultados locais.

    return resultados.sort((a, b) => a._nivelProximidade - b._nivelProximidade

      || a.clinica.localeCompare(b.clinica, "pt-BR"));

  }, [cidadeRegiao, procedimentos, regioesMenu]);

  const clinicas = useMemo(() => listaUnica(catalogoRegional.map((p) => p.clinica)), [catalogoRegional]);

  const examesDisponiveis = useMemo(() => catalogoRegional.filter((p) =>

    (!clinicaSelecionada || p.clinica === clinicaSelecionada)

    && (!normalizar(filtroExame) || normalizar(p.procedimento).includes(normalizar(filtroExame)))

  ), [catalogoRegional, clinicaSelecionada, filtroExame]);

  const exameAtual = examesDisponiveis.find((p) => `${p.aba_origem}-${p.linha_origem}` === exameSelecionado) || null;

  // O cliente paga o valor Doutor Saúde Familiar; o valor particular é apenas referência comparativa.

  const total = carrinho.reduce((s, i) => s + Number(i.valorDoutorTodos || 0), 0);

  const totalParticular = carrinho.reduce((s, i) => s + Number(i.valorParticular || 0), 0);

  const totalRepasseInterno = carrinho.reduce((s, i) => s + Number(i.valorRepasse || 0), 0);

  const descontoInformado = Math.max(0, Number(String(valorDesconto).replace(",", ".")) || 0);

  const descontoAplicado = tipoDesconto === "percentual"

    ? Math.min(total, total * Math.min(descontoInformado, 100) / 100)

    : Math.min(total, descontoInformado);

  const totalComDesconto = Math.max(0, Number((total - descontoAplicado).toFixed(2)));

  const selecionarRegiao = (v) => {

    setCidadeRegiao(v);

    setClinicaSelecionada("");

    setExameSelecionado("");

    setFiltroExame("");

    setCarrinho([]);

    setMensagem("");

  };

  const adicionarExame = () => {

    if (!exameAtual) return;

    const valorRepasse = valorNumerico(campo(exameAtual, "B"));

    const valorDoutorTodos = valorNumerico(campo(exameAtual, "C"));

    // A coluna C foi identificada pelo usuário como Valor Doutor Saúde Familiar.

    // O particular é calculado com acréscimo de 70% sobre esse valor.

    if (!(valorDoutorTodos > 0)) {

      setMensagem("Este procedimento não possui Valor Doutor Saúde Familiar numérico na coluna C. Confira a planilha antes de adicionar ao orçamento.");

      return;

    }

    const valorParticular = Number((valorDoutorTodos * 1.70).toFixed(2));

    setCarrinho((atual) => [...atual, {

      procedimentoId: `${exameAtual.aba_origem}-${exameAtual.linha_origem}`,

      clinicaNome: exameAtual.clinica,

      exameNome: exameAtual.procedimento,

      cidadeClinica: (exameAtual.cidade_clinica || []).join(", "),

      enderecos: exameAtual.enderecos || [],

      telefones: exameAtual.telefones || [],

      valor: Number(valorDoutorTodos.toFixed(2)),

      valorRepasse,

      valorDoutorTodos: Number(valorDoutorTodos.toFixed(2)),

      valorParticular,

      origem: exameAtual.aba_origem,

      linhaOrigem: exameAtual.linha_origem,

      observacoes: exameAtual.observacoes || "",

    }]);

    setMensagem("");

  };

  const removerItem = (idx) => setCarrinho((atual) => atual.filter((_, i) => i !== idx));

  const gerarOrcamento = () => {

    if (!cliente || !carrinho.length) {

      setMensagem("Selecione um cliente e adicione pelo menos um exame para gerar o orçamento.");

      return;

    }

    const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({

      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",

    }[c]));

    const linhas = carrinho.map((item) => `

      <tr>

        <td>${escapeHtml(item.exameNome)}</td>

        <td>${escapeHtml(item.clinicaNome)}</td>

        <td>${escapeHtml(item.cidadeClinica || "")}<br>${escapeHtml((item.enderecos || []).join(" | "))}</td>

        <td>${moeda(item.valorParticular)}</td>

        <td><strong>${moeda(item.valorDoutorTodos)}</strong></td>

      </tr>`).join("");

    const logoUrl = logotipo;

    const html = `<!doctype html>

<html lang="pt-BR"><head><meta charset="utf-8"><title>Orçamento - Doutor Saúde Familiar</title>

<style>

  @page{size:A4;margin:18mm}*{box-sizing:border-box}

  body{font:13px Arial,sans-serif;color:#243447;margin:0}

  .topo{display:flex;align-items:center;gap:22px;border-bottom:3px solid #29465f;padding-bottom:16px}

  .logo{max-width:170px;max-height:85px;object-fit:contain}

  .empresa h1{font-size:21px;color:#29465f;margin:0 0 6px}

  .empresa p{margin:3px 0;color:#526477}

  h2{color:#29465f;margin:24px 0 12px;font-size:18px}

  .cliente{background:#f3f6f9;padding:14px;border-radius:7px;line-height:1.7}

  table{width:100%;border-collapse:collapse;margin-top:18px;font-size:11px}

  th{background:#29465f;color:#fff;text-align:left}

  th,td{padding:10px 8px;border:1px solid #d7e0e8;vertical-align:top}

  .totais{margin:18px 0 0 auto;width:290px}

  .linha-total{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #d7e0e8}

  .destaque{font-size:17px;color:#176b4b;font-weight:bold}

  .rodape{margin-top:35px;padding-top:12px;border-top:1px solid #d7e0e8;color:#64748b;font-size:10px}

  @media print{button{display:none}}

</style></head><body>

<header class="topo">

  <img class="logo" src="${logoUrl}" alt="Logo Doutor Saúde Familiar">

  <div class="empresa"><h1>Doutor Saúde Familiar</h1>

    <p><strong>CNPJ:</strong> 11.948.609/0001-03</p>

    <p><strong>Telefones:</strong> (11) 4395-6295 | (11) 3777-8504</p>

  </div>

</header>

<h2>Orçamento de exames</h2>

<div class="cliente">

  <strong>Cliente:</strong> ${escapeHtml(campoNome(cliente))}<br>

  <strong>CPF/CNPJ:</strong> ${escapeHtml(campoCpf(cliente) || "Não informado")}<br>

  <strong>Telefone:</strong> ${escapeHtml(cliente.celular || cliente.telefone || "Não informado")}<br>

  <strong>Data:</strong> ${new Date().toLocaleDateString("pt-BR")}

</div>

<table><thead><tr><th>Exame</th><th>Clínica</th><th>Localização</th><th>Particular</th><th>Doutor Saúde Familiar</th></tr></thead>

<tbody>${linhas}</tbody></table>

<div class="totais">

  <div class="linha-total"><span>Total particular</span><strong>${moeda(totalParticular)}</strong></div>

  <div class="linha-total"><span>Subtotal Doutor Saúde Familiar</span><strong>${moeda(total)}</strong></div>

  ${descontoAplicado > 0 ? `<div class="linha-total"><span>Desconto ${tipoDesconto === "percentual" ? `(${descontoInformado}% )` : ""}</span><strong>- ${moeda(descontoAplicado)}</strong></div>` : ""}

  <div class="linha-total destaque"><span>Total com desconto Doutor Saúde Familiar</span><strong>${moeda(totalComDesconto)}</strong></div>

</div>

<div class="rodape">Este orçamento apresenta os valores regulares dos procedimentos. O desconto interno, quando houver, não integra este documento. Valores e disponibilidade sujeitos à confirmação no momento do agendamento.</div>

<script>window.addEventListener('load',()=>{const img=document.querySelector('.logo');const imprimir=()=>setTimeout(()=>window.print(),250);if(!img||img.complete)imprimir();else{img.onload=imprimir;img.onerror=imprimir;setTimeout(imprimir,2000)}})</script>

</body></html>`;

    const janela = window.open("", "_blank", "width=1000,height=800");

    if (!janela) {

      setMensagem("O navegador bloqueou a janela do orçamento. Permita pop-ups para este sistema e tente novamente.");

      return;

    }

    janela.document.open();

    janela.document.write(html);

    janela.document.close();

  };

  const iniciarPagamento = async () => {

    if (!cliente || !carrinho.length) return;

    if (typeof onCriarCheckoutExame !== "function") {

      setMensagem("O checkout específico de exames ainda precisa ser conectado ao backend. Nenhuma cobrança foi criada.");

      return;

    }

    setSalvando(true);

    setMensagem("");

    try {

      const auth = getAuth();

      if (!auth.currentUser) {

        throw new Error("Sua sessão expirou. Entre novamente no sistema para gerar a cobrança.");

      }

      const tokenFirebase = await auth.currentUser.getIdToken();

      if (!tokenFirebase) {

        throw new Error("Não foi possível validar sua sessão. Entre novamente e tente outra vez.");

      }

      const dadosVenda = {

        clienteId: cliente.id,

        clienteNome: campoNome(cliente),

        clienteCPF: campoCpf(cliente),

        contratoId: contratoVinculado?.id || null,

        itens: carrinho,

        valorOriginal: Number(total.toFixed(2)),

        descontoTipo: tipoDesconto,

        descontoInformado,

        descontoValor: Number(descontoAplicado.toFixed(2)),

        valorTotal: Number(totalComDesconto.toFixed(2)),

        statusVenda: "Pendente",

        statusPagamento: "Não iniciado",

        pagamentoConfirmado: false,

        guiaEmitida: false,

        origem: "Venda de Exames",

        vendedorId: usuario?.uid || usuario?.id || auth.currentUser?.uid || null,

        vendedorNome: usuario?.nome || usuario?.displayName || usuario?.nomeCompleto || "",

        criadoEm: serverTimestamp(),

      };

      const ref = await addDoc(collection(db, "vendasExames"), dadosVenda);
      setVendaAtual({ id: ref.id, ...dadosVenda });

      // Remover o repasse dos itens enviados ao checkout. Ele fica apenas no registro interno.

      const itensCheckout = carrinho.map(({ valorRepasse, ...item }) => item);

      const resposta = await onCriarCheckoutExame({

        vendaId: ref.id,

        cliente,

        itens: itensCheckout,

        valorOriginal: Number(total.toFixed(2)),

        descontoTipo: tipoDesconto,

        descontoInformado,

        descontoValor: Number(descontoAplicado.toFixed(2)),

        valorTotal: Number(totalComDesconto.toFixed(2)),

        tokenFirebase,

      });

      if (!resposta || resposta.ok === false) throw new Error(resposta?.message || "Não foi possível iniciar o checkout.");

      setVendaAtual({ id: ref.id, ...dadosVenda, pagamentoConfirmado: false });

      setCheckoutInfo(resposta);

      setMensagem("Venda registrada. A guia será liberada somente após confirmação do pagamento pelo webhook.");

    } catch (err) {

      console.error("Erro ao iniciar pagamento de exame:", err);

      setMensagem(err.message || "Falha ao iniciar o pagamento.");

    } finally {

      setSalvando(false);

    }

  };

  const irCadastro = () => {

    if (typeof onNavigate === "function") onNavigate("/clientes/novo");

    else setMensagem("Acesse Novo Cliente → Cadastro de Cliente no menu lateral.");

  };

  const atualizarVenda = async () => {

    if (!vendaAtual?.id) return;

    try {

      const atual = await getDoc(doc(db, "vendasExames", String(vendaAtual.id)));

      if (!atual.exists()) {

        setMensagem("Venda não encontrada. Confira o identificador e tente novamente.");

        return;

      }

      const dados = atual.data();

      setVendaAtual({ id: atual.id, ...dados });

      if (pagamentoEstaConfirmado(dados)) {

        setModalPagamentoAberto(true);

        setMensagem("Pagamento confirmado. Guia de autorização liberada.");

      } else {

        setMensagem("Pagamento ainda não confirmado. A guia permanece bloqueada.");

      }

    } catch (e) {

      console.error(e);

      setMensagem("Não foi possível atualizar o status do pagamento.");

    }

  };

  return (

    <main className="ve-page">

      <header className="ve-header">

        <div>

          <span className="ve-kicker">ATENDIMENTO E DIAGNÓSTICO</span>

          <h1>Venda de Exames</h1>

          <p>Consulte o catálogo original, filtre por cidade ou região e gere a cobrança.</p>

        </div>

      </header>

      <section className="ve-card">

        <div className="ve-section-title">

          <UserRound size={19} />

          <div><h2>Identificar cliente</h2><p>Pesquise pelo nome completo ou CPF. Nenhuma listagem será exibida.</p></div>

        </div>

        <form className="ve-search" onSubmit={buscarCliente}>

          <div className="ve-search-input">

            <Search size={19} />

            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite o nome ou CPF do cliente" autoComplete="off" />

          </div>

          <button className="ve-btn ve-btn-primary" disabled={buscando}>{buscando ? "Buscando..." : "Buscar cliente"}</button>

        </form>

        {erroBusca && (

          <div className="ve-alert ve-alert-warning">

            <AlertCircle size={18} /><span>{erroBusca}</span>

            {erroBusca.includes("Cadastre primeiro") && <button type="button" onClick={irCadastro} className="ve-btn ve-btn-small"><UserPlus size={15} /> Cadastrar cliente</button>}

          </div>

        )}

        {cliente && (

          <div className="ve-client-selected">

            <div className="ve-avatar"><UserRound /></div>

            <div className="ve-client-data"><strong>{campoNome(cliente)}</strong><span>CPF: {campoCpf(cliente) || "Não informado"}</span><span>{cliente.celular || cliente.telefone || cliente.email || "Contato não informado"}</span></div>

            <button type="button" className="ve-icon-btn" title="Remover cliente" onClick={() => { setCliente(null); setContratoVinculado(null); setCarrinho([]); setVendaAtual(null); }}><X size={18} /></button>

          </div>

        )}

      </section>

      {cliente && (

        <>

          <section className="ve-card">

            <div className="ve-section-title">

              <Map size={19} />

              <div><h2>Localizar clínicas por região</h2><p>Escolha uma cidade, bairro ou região cadastrada na aba MENU da planilha. A lista será filtrada com base nas associações existentes no arquivo.</p></div>

            </div>

            <div className="ve-filters">

              <label>Cidade, bairro ou região

                <input list="ve-cidades-lista" value={cidadeRegiao} onChange={(e) => selecionarRegiao(e.target.value)} placeholder="Ex.: Osasco, Zona Oeste, Jundiaí" />

                <datalist id="ve-cidades-lista">{[...cidadesDisponiveis, ...regioesDisponiveis].map((c) => <option key={c} value={c} />)}</datalist>

              </label>

              <label>Clínica / Laboratório

                <select value={clinicaSelecionada} onChange={(e) => { setClinicaSelecionada(e.target.value); setExameSelecionado(""); }}>

                  <option value="">Todas as clínicas da região</option>

                  {clinicas.map((c) => <option key={c} value={c}>{c}</option>)}

                </select>

              </label>

              <label>Buscar exame

                <input value={filtroExame} onChange={(e) => setFiltroExame(e.target.value)} placeholder="Ex.: ultrassom, tomografia..." />

              </label>

            </div>

            {!cidadeRegiao.trim() && <p className="ve-empty">Informe uma cidade ou região para visualizar somente as clínicas correspondentes.</p>}

            {cidadeRegiao.trim() && catalogoRegional.length === 0 && <p className="ve-empty">Não há procedimentos associados a essa cidade/região no catálogo. Tente outro nome ou confira a aba MENU da planilha.</p>}

            {cidadeRegiao.trim() && catalogoRegional.length > 0 && <p className="ve-result-count">{clinicas.length} clínica(s) e {examesDisponiveis.length} procedimento(s) encontrados. Primeiro aparecem as unidades da localidade pesquisada; depois, as cidades próximas disponíveis no cadastro.</p>}

            <div className="ve-select-exam">

              <label>Procedimento

                <select value={exameSelecionado} onChange={(e) => setExameSelecionado(e.target.value)} disabled={!cidadeRegiao.trim() || !examesDisponiveis.length}>

                  <option value="">Selecione um exame</option>

                  {examesDisponiveis.map((p) => {

                    const id = `${p.aba_origem}-${p.linha_origem}`;

                    return <option key={id} value={id}>{p.procedimento} — {p.clinica}{p._nivelProximidade > 0 ? ` (cidade próxima: ${p._localidadeEncontrada})` : ""}</option>;

                  })}

                </select>

              </label>

              <button type="button" className="ve-btn ve-btn-primary" onClick={adicionarExame} disabled={!exameAtual}><Plus size={17} /> Adicionar ao orçamento</button>

            </div>

            {exameAtual && (

              <div className="ve-exam-detail">

                <div>

                  <strong>{exameAtual.clinica}</strong>

                  <span><MapPin size={14} /> {exameAtual._localidadeEncontrada || (exameAtual.cidade_clinica || []).join(", ") || "Cidade não identificada"}{exameAtual._nivelProximidade > 0 ? " · unidade em cidade próxima" : " · localidade pesquisada"}</span>

                  {(exameAtual.enderecos || []).map((a, i) => <span key={i}><MapPin size={14} /> {a}</span>)}

                  {(exameAtual.telefones || []).map((t, i) => <span key={i}><Phone size={14} /> {t}</span>)}

                  {exameAtual.observacoes && <small>{exameAtual.observacoes}</small>}

                  <small>Origem: aba “{exameAtual.aba_origem}”, linha {exameAtual.linha_origem}.</small>

                </div>

                <div className="ve-prices ve-price-grid">

                  <span className="ve-price-box ve-price-internal">Repasse (interno)<strong>{moeda(campo(exameAtual, "B"))}</strong></span>

                  <span className="ve-price-box ve-price-ddt">Doutor Saúde Familiar<strong>{moeda(campo(exameAtual, "C"))}</strong></span>

                  <span className="ve-price-box ve-price-private">Particular <strong>{moeda(valorNumerico(campo(exameAtual, "C")) > 0 ? Number((valorNumerico(campo(exameAtual, "C")) * 1.70).toFixed(2)) : null)}</strong></span>

                </div>

              </div>

            )}

          </section>

          <section className="ve-card">

            <div className="ve-section-title">

              <ClipboardList size={19} />

              <div><h2>Orçamento do cliente</h2><p>O cliente visualiza somente os valores Particular e Doutor Saúde Familiar. O repasse fica restrito à área interna.</p></div>

            </div>

            {carrinho.length === 0 ? <div className="ve-empty">Nenhum exame adicionado ao orçamento.</div> : (

              <div className="ve-table-wrap">

                <table className="ve-table">

                  <thead><tr><th>Exame</th><th>Clínica</th><th>Cidade / endereço / telefone</th><th>Particular</th><th>Doutor Saúde Familiar</th><th /></tr></thead>

                  <tbody>{carrinho.map((i, idx) => (

                    <tr key={`${i.procedimentoId}-${idx}`}>

                      <td><strong>{i.exameNome}</strong><small>{i.origem}, linha {i.linhaOrigem}</small></td>

                      <td>{i.clinicaNome}</td>

                      <td>{i.cidadeClinica}<br />{i.enderecos.join(" | ")}<br />{i.telefones.join(" | ")}</td>

                      <td><strong>{moeda(i.valorParticular)}</strong></td>

                      <td><strong>{moeda(i.valorDoutorTodos)}</strong></td>

                      <td><button type="button" className="ve-icon-btn ve-danger" onClick={() => removerItem(idx)} title="Remover"><Trash2 size={17} /></button></td>

                    </tr>

                  ))}</tbody>

                </table>

              </div>

            )}

            <div className="ve-total"><span>Total Doutor Saúde Familiar (valor da cobrança)</span><strong>{moeda(totalComDesconto)}</strong></div>

            <div className="ve-total"><span>Total Particular (referência)</span><strong>{moeda(totalParticular)}</strong></div>

            <div className="ve-internal-totals">

              <span>Repasse total (somente interno): <strong>{moeda(totalRepasseInterno)}</strong></span>

            </div>

            <section className="ve-discount-panel">

              <div>

                <strong>Desconto para o cliente</strong>

                <p>Informe o desconto que será concedido ao cliente. O valor será aplicado ao orçamento e à cobrança.</p>

              </div>

              <div className="ve-discount-controls">

                <select aria-label="Tipo de desconto" value={tipoDesconto} onChange={(e) => setTipoDesconto(e.target.value)}>

                  <option value="percentual">Porcentagem (%)</option>

                  <option value="valor">Valor em reais (R$)</option>

                </select>

                <input aria-label="Valor do desconto" type="number" min="0" step="0.01" value={valorDesconto} onChange={(e) => setValorDesconto(e.target.value)} placeholder={tipoDesconto === "percentual" ? "Ex.: 10" : "Ex.: 25,00"} />

              </div>

              <div className="ve-discount-result">

                <span>Desconto aplicado: <strong>{moeda(descontoAplicado)}</strong></span>

                <span>Total com desconto: <strong>{moeda(totalComDesconto)}</strong></span>

              </div>

              <small>O desconto será registrado na venda e enviado ao checkout. O repasse permanece restrito à área interna e nunca será enviado ao cliente.</small>

            </section>

            <div className="ve-actions">

              <button type="button" className="ve-btn ve-btn-light" onClick={gerarOrcamento} disabled={!carrinho.length || !cliente}><FileText size={17} /> Gerar orçamento</button>

              <button type="button" className="ve-btn ve-btn-primary" onClick={iniciarPagamento} disabled={!carrinho.length || salvando}><CreditCard size={17} />{salvando ? "Preparando cobrança..." : "Gerar pagamento"}</button>

            </div>

            {mensagem && <div className="ve-alert ve-alert-info"><AlertCircle size={18} />{mensagem}</div>}

            {checkoutInfo?.checkoutUrl && <p className="ve-checkout-link"><a href={checkoutInfo.checkoutUrl} target="_blank" rel="noreferrer">Abrir link de pagamento</a></p>}

          </section>

          {vendaAtual && (

            <section className="ve-card ve-payment-state">

              <div className="ve-section-title"><FileText size={19} /><div><h2>Venda registrada</h2><p>Identificador: {vendaAtual.id}</p></div></div>

              {pagamentoEstaConfirmado(vendaAtual) ? (

                <>

                  <div className="ve-alert ve-alert-success">Pagamento confirmado. Guia de autorização liberada.</div>

                  <button type="button" className="ve-btn ve-btn-primary" onClick={() => pagamentoEstaConfirmado(vendaAtual) && imprimirGuia(vendaAtual, cliente)}><Printer size={17} /> Emitir guia de autorização</button>

                </>

              ) : (

                <>

                  <div className="ve-alert ve-alert-warning"><AlertCircle size={18} /> Pagamento aguardando confirmação. A guia ainda não está liberada.</div>

                  <button type="button" className="ve-btn ve-btn-light" onClick={atualizarVenda}><RefreshCw size={16} /> Atualizar situação do pagamento</button>

                </>

              )}

            </section>

          )}

          {pagamentoEstaConfirmado(vendaAtual) && modalPagamentoAberto && (

            <div role="dialog" aria-modal="true" aria-labelledby="ve-pagamento-confirmado-titulo" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(15, 23, 42, .58)", display: "grid", placeItems: "center", padding: "20px" }}>

              <section style={{ width: "min(100%, 460px)", background: "#fff", borderRadius: "18px", padding: "28px", boxShadow: "0 20px 60px rgba(0,0,0,.25)", textAlign: "center" }}>

                <div style={{ width: "58px", height: "58px", borderRadius: "50%", background: "#dcfce7", color: "#15803d", display: "grid", placeItems: "center", fontSize: "32px", margin: "0 auto 14px" }}>✓</div>

                <h2 id="ve-pagamento-confirmado-titulo">Pagamento realizado!</h2>

                <p>O pagamento dos exames foi confirmado. Agora você já pode gerar a guia de autorização.</p>

                <button type="button" className="ve-icon-btn" aria-label="Fechar confirmação" onClick={() => setModalPagamentoAberto(false)} style={{ margin: "0 auto 12px" }}><X size={18} /></button>

                <button type="button" className="ve-btn ve-btn-primary" onClick={() => pagamentoEstaConfirmado(vendaAtual) && imprimirGuia(vendaAtual, cliente)}><Printer size={17} /> Gerar minha guia agora</button>

              </section>

            </div>

          )}

        </>

      )}

    </main>

  );

}