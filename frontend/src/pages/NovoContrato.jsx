

import { useEffect, useState } from "react";

import {

  addDoc,

  collection,

  deleteDoc,

  doc,

  getDoc,

  getDocs,

  query,

  runTransaction,

  serverTimestamp,

  setDoc,

  updateDoc,

  where,

} from "firebase/firestore";



import {

  FileText,

  UserRound,

  Users,

  Bell,

  Wallet,

  History,

  Search,

  Save,

  Plus,

  Trash2,

  LoaderCircle,

  CheckCircle2,

} from "lucide-react";





import { db } from "../config/firebase";



import "./NovoContrato.css";



// =====================================================

// LISTAS DO FORMULÁRIO

// =====================================================



const ESTADOS = [

  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO",

  "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",

  "RJ", "RN", "RS", "RO", "RR", "SC", "SE", "SP", "TO",

];



const PROFISSOES = [

  "Administrador",

  "Advogado",

  "Aposentado",

  "Autônomo",

  "Comerciante",

  "Empresário",

  "Estudante",

  "Funcionário público",

  "Professor",

  "Profissional liberal",

  "Vendedor",

  "Outros",

];



const ESTADOS_CIVIS = [

  "Solteiro(a)",

  "Casado(a)",

  "Divorciado(a)",

  "Separado(a)",

  "Viúvo(a)",

  "União estável",

];



const ESCOLARIDADES = [

  "Não alfabetizado",

  "Ensino fundamental incompleto",

  "Ensino fundamental completo",

  "Ensino médio incompleto",

  "Ensino médio completo",

  "Ensino superior incompleto",

  "Ensino superior completo",

  "Pós-graduação",

];



const PARENTESCOS = [

  "Amigo",

  "Avô",

  "Avó",

  "Cônjuge",

  "Cunhado",

  "Enteado",

  "Filho",

  "Genro",

  "Irmã",

  "Irmão",

  "Mãe",

  "Neto",

  "Nora",

  "Outros",

  "Pai",

  "Parente",

  "Primo",

  "Sobrinho",

  "Tio",

  "Titular",

];



const FORMAS_PAGAMENTO = [

  "PIX",

  "Boleto",

  "Cartão",

  "ENEL",

  "Pix mensalista",

  "EDP",

  "Link Asaas",

  "Link Único Asaas",

  "Pagar.me",

];



const PERIODICIDADES = [

  "Mensal",

  "Trimestral",

  "Semestral",

  "Anual",

  "Exames",

];



const CANAIS_VENDA = [

  "Ativo",

  "Google",

  "Indicação",

  "Lead",

  "Receptivo",

  "Renovação",

  "UP",

  "Recuperação",

  "Site",

];



// =====================================================

// FORMULÁRIOS INICIAIS

// =====================================================



const FORMULARIO_INICIAL = {

  cpf: "",

  nomeCompleto: "",

  dataNascimento: "",

  sexo: "",

  profissao: "",

  estadoCivil: "",

  escolaridade: "",

  nacionalidade: "Brasileira",

  nomeMae: "",

  nomePai: "",

  cep: "",

  endereco: "",

  numero: "",

  complemento: "",

  bairro: "",

  estado: "",

  cidade: "",

  telefone: "",

  celular: "",

  celular2: "",

  whatsapp: "",

  email: "",

  canalVenda: "",

};



const DEPENDENTE_INICIAL = {

  cpf: "",

  nome: "",

  parentesco: "",

  nascimento: "",

  sexo: "",

  telefone: "",

  celular: "",

  celular2: "",

  whatsapp: "",

};



const PAGAMENTO_INICIAL = {

  planoId: "",

  planoNome: "",

  valor: "",

  quantidadeDependentes: 0,

  dependentesPlus: 0,

  periodicidade: "",

  formaPagamento: "",

  observacoesVendedor: "",

  nomeInstalacao: "",

  numeroInstalacao: "",

  numeroClienteEnergia: "",

  nomeCartao: "",

  cartaoFinal: "",

  vencimento: "",

  observacoesPagamento: "",

};



// =====================================================

// FUNÇÕES AUXILIARES

// =====================================================



function somenteNumeros(valor) {

  return String(valor || "").replace(/\D/g, "");

}



function formatarCPF(valor) {

  return somenteNumeros(valor)

    .slice(0, 11)

    .replace(/(\d{3})(\d)/, "$1.$2")

    .replace(/(\d{3})(\d)/, "$1.$2")

    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

}



function validarCPF(cpf) {

  const numero = somenteNumeros(cpf);



  if (numero.length !== 11 || /^(\d)\1+$/.test(numero)) {

    return false;

  }



  let soma = 0;



  for (let i = 0; i < 9; i++) {

    soma += Number(numero[i]) * (10 - i);

  }



  let digito = (soma * 10) % 11;

  if (digito === 10) digito = 0;



  if (digito !== Number(numero[9])) {

    return false;

  }



  soma = 0;



  for (let i = 0; i < 10; i++) {

    soma += Number(numero[i]) * (11 - i);

  }



  digito = (soma * 10) % 11;

  if (digito === 10) digito = 0;



  return digito === Number(numero[10]);

}



function formatarTelefone(valor) {

  const numero = somenteNumeros(valor).slice(0, 11);



  if (numero.length <= 10) {

    return numero

      .replace(/(\d{2})(\d)/, "($1) $2")

      .replace(/(\d{4})(\d)/, "$1-$2");

  }



  return numero

    .replace(/(\d{2})(\d)/, "($1) $2")

    .replace(/(\d{5})(\d)/, "$1-$2");

}



function dinheiro(valor) {

  return Number(valor || 0).toLocaleString("pt-BR", {

    style: "currency",

    currency: "BRL",

  });

}



function dataAgora() {

  return new Date().toLocaleString("pt-BR");

}



function dataLegivel(valor) {

  if (!valor) return "-";



  if (typeof valor === "string") return valor;



  if (valor?.toDate) {

    return valor.toDate().toLocaleString("pt-BR");

  }



  return "-";

}



// =====================================================

// COMPONENTE DE CAMPO

// =====================================================



function Campo({

  label,

  name,

  value,

  onChange,

  type = "text",

  required = false,

  options,

  placeholder = "",

  disabled = false,

  className = "",

}) {

  return (

    <label className={`nc-campo ${className}`}>

      <span>

        {label}

        {required && <b className="nc-obrigatorio"> *</b>}

      </span>



      {options ? (

        <select

          name={name}

          value={value ?? ""}

          onChange={onChange}

          required={required}

          disabled={disabled}

        >

          <option value="">Selecione uma opção</option>



          {options.map((opcao) => (

            <option

              key={opcao.value ?? opcao}

              value={opcao.value ?? opcao}

            >

              {opcao.label ?? opcao}

            </option>

          ))}

        </select>

      ) : (

        <input

          name={name}

          type={type}

          value={value ?? ""}

          onChange={onChange}

          required={required}

          placeholder={placeholder}

          disabled={disabled}

        />

      )}

    </label>

  );

}



// =====================================================

// COMPONENTE PRINCIPAL

// =====================================================



export default function NovoContrato({ usuario, onNavigate }) {

  const [formulario, setFormulario] = useState(FORMULARIO_INICIAL);

  const [pagamento, setPagamento] = useState(PAGAMENTO_INICIAL);
  const [cvv, setCvv] = useState("");

  const [dependente, setDependente] = useState(DEPENDENTE_INICIAL);



  const [clienteId, setClienteId] = useState("");

  const [contratoId, setContratoId] = useState("");
  const [statusContrato, setStatusContrato] = useState({
    statusVenda: "Pendente",
    pendenciaCadastro: "NÃO TEM CONTRATO ASSINADO",
    statusPagamento: "Não iniciado",
  });

  const [fluxoVendaCarteirinha, setFluxoVendaCarteirinha] = useState(() => {
    try {
      const salvo = sessionStorage.getItem("fluxoVendaCarteirinha");
      return salvo ? JSON.parse(salvo) : null;
    } catch (error) {
      console.error("Erro ao recuperar fluxo da venda:", error);
      return null;
    }
  });



  const [departamentoId, setDepartamentoId] = useState("");

  const [nomeDepartamento, setNomeDepartamento] = useState("");



  const [planos, setPlanos] = useState([]);

  const [dependentes, setDependentes] = useState([]);

  const [notificacoes, setNotificacoes] = useState([]);

  const [cobrancas, setCobrancas] = useState([]);

  const [historico, setHistorico] = useState([]);



  const [aba, setAba] = useState("dados");

  const [modoEdicao, setModoEdicao] = useState(false);



  const [modalDependente, setModalDependente] = useState(false);



  const [carregando, setCarregando] = useState(false);

  const [carregandoPlanos, setCarregandoPlanos] = useState(true);

  const [buscandoCep, setBuscandoCep] = useState(false);



  const [erro, setErro] = useState("");

  const [sucesso, setSucesso] = useState("");

  const [busca, setBusca] = useState("");



  const [notificacao, setNotificacao] = useState({

    assunto: "",

    mensagem: "",

  });



  const [cobranca, setCobranca] = useState({

    valor: "",

    periodicidade: "",

    formaPagamento: "",

    descricao: "",

  });



  const vendedorNome =

    usuario?.displayName || usuario?.email || "Usuário";



  // ===================================================

  // CARREGAR PERFIL E PLANOS

  // ===================================================



  useEffect(() => {

    let ativo = true;



    async function carregarDadosIniciais() {

      try {

        if (usuario?.uid) {

          const perfilRef = doc(db, "usuarios", usuario.uid);

          const perfilSnap = await getDoc(perfilRef);



          if (perfilSnap.exists() && ativo) {

            const perfil = perfilSnap.data();



            setDepartamentoId(

              perfil.departamentoId || perfil.departamento || ""

            );



            setNomeDepartamento(

              perfil.departamentoNome ||

              perfil.departamento ||

              ""

            );

          }

        }



        const planosSnap = await getDocs(collection(db, "planos"));



        if (ativo) {

          setPlanos(

            planosSnap.docs

              .filter((item) => item.data().ativo !== false)

              .map((item) => ({

                id: item.id,

                ...item.data(),

              }))

          );

        }

      } catch (error) {

        console.error("Erro ao carregar dados:", error);



        if (ativo) {

          setErro(

            "Não foi possível carregar o perfil ou os planos."

          );

        }

      } finally {

        if (ativo) setCarregandoPlanos(false);

      }

    }



    carregarDadosIniciais();



    return () => {

      ativo = false;

    };

  }, [usuario]);



  // ===================================================

  // CARREGAR DADOS RELACIONADOS AO CONTRATO

  // ===================================================



  async function carregarRelacionados(id, idCliente = clienteId) {
    if (!id) return;

    const nomes = ["dependentes", "notificacoes", "cobrancas", "historico"];
    const resultados = await Promise.all(
      nomes.map((nome) => getDocs(collection(db, "contratos", id, nome)))
    );

    setDependentes(resultados[0].docs.map((item) => ({ id: item.id, ...item.data() })));
    setNotificacoes(resultados[1].docs.map((item) => ({ id: item.id, ...item.data() })));
    setCobrancas(resultados[2].docs.map((item) => ({ id: item.id, ...item.data() })));

    // Histórico canônico: historicoContratos/{contratoId}/eventos.
    // Os caminhos antigos continuam sendo lidos durante a transição.
    const consultasHistorico = [
      getDocs(collection(db, "historicoContratos", id, "eventos")),
    ];

    if (idCliente) {
      consultasHistorico.push(
        getDocs(collection(db, "clientes", idCliente, "historico"))
      );
    }

    const [snapCentral, snapCliente] = await Promise.all(consultasHistorico);
    const historicoCentral = snapCentral.docs.map((item) => ({
      id: item.id,
      ...item.data(),
      origemHistorico: "central",
    }));
    const historicoCliente = snapCliente
      ? snapCliente.docs.map((item) => ({
          id: item.id,
          ...item.data(),
          origemHistorico: "cliente",
        }))
      : [];
    const historicoContrato = resultados[3].docs.map((item) => ({
      id: item.id,
      ...item.data(),
      origemHistorico: "contrato",
    }));

    // Prioriza o evento central e elimina cópias legadas pelo eventoId.
    const unicos = new Map();
    [...historicoContrato, ...historicoCliente, ...historicoCentral].forEach((item) => {
      const chave = item.eventoId || item.id;
      const anterior = unicos.get(chave);
      if (
        !anterior ||
        item.origemHistorico === "central" ||
        (anterior.origemHistorico !== "central" && item.origemHistorico === "cliente")
      ) {
        unicos.set(chave, item);
      }
    });

    const dataMs = (item) =>
      item.criadoEm?.toDate
        ? item.criadoEm.toDate().getTime()
        : item.criadoEm?.seconds
          ? item.criadoEm.seconds * 1000
          : 0;

    setHistorico([...unicos.values()].sort((a, b) => dataMs(b) - dataMs(a)));
  }

  // Registra um único evento canônico e mantém cópias nos caminhos legados.
  async function registrarHistorico({
    idCliente = clienteId,
    idContrato = contratoId,
    tipo,
    descricao,
    dados = {},
  }) {
    if (!idCliente || !idContrato) {
      throw new Error("Não foi possível identificar o cliente e o contrato para registrar o histórico.");
    }

    const eventoRef = doc(collection(db, "historicoContratos", idContrato, "eventos"));
    const evento = {
      eventoId: eventoRef.id,
      clienteId: idCliente,
      contratoId: idContrato,
      tipo,
      descricao,
      ...dados,
      usuarioId: usuario?.uid || "sistema",
      usuarioNome: vendedorNome,
      origem: "sistema_interno",
      criadoEm: serverTimestamp(),
    };

    await Promise.all([
      setDoc(eventoRef, evento),
      setDoc(doc(db, "clientes", idCliente, "historico", eventoRef.id), evento),
      setDoc(doc(db, "contratos", idContrato, "historico", eventoRef.id), evento),
    ]);
  }


  // ===================================================

  // ATUALIZAÇÃO DOS CAMPOS

  // ===================================================



  function atualizarFormulario(evento) {

    const { name, value } = evento.target;



    setFormulario((atual) => ({

      ...atual,

      [name]: value,

    }));



    setErro("");

    setSucesso("");

  }



  function atualizarPagamento(evento) {

    const { name, value } = evento.target;



    if (name === "planoId") {

      const plano = planos.find((item) => item.id === value);



      setPagamento((atual) => ({

        ...atual,

        planoId: value,

        planoNome: plano?.nome || plano?.titulo || "",

        valor: plano?.valor ?? plano?.preco ?? "",

        quantidadeDependentes:

          plano?.quantidadeDependentes ?? 0,

        dependentesPlus: plano?.dependentesPlus ?? 0,

      }));

    } else {

      setPagamento((atual) => ({

        ...atual,

        [name]: value,

      }));

    }



    setErro("");

    setSucesso("");

  }



  // ===================================================

  // BUSCAR CEP

  // ===================================================



  async function buscarCep() {

    const cep = somenteNumeros(formulario.cep);



    if (cep.length !== 8) {

      setErro("Informe um CEP válido com 8 números.");

      return;

    }



    setBuscandoCep(true);

    setErro("");



    try {

      const resposta = await fetch(

        `https://viacep.com.br/ws/${cep}/json/`

      );



      if (!resposta.ok) {

        throw new Error("Falha ao consultar o CEP.");

      }



      const dados = await resposta.json();



      if (dados.erro) {

        throw new Error("CEP não encontrado.");

      }



      setFormulario((atual) => ({

        ...atual,

        endereco: dados.logradouro || atual.endereco,

        bairro: dados.bairro || atual.bairro,

        cidade: dados.localidade || atual.cidade,

        estado: dados.uf || atual.estado,

      }));

    } catch (error) {

      setErro(error.message || "Não foi possível consultar o CEP.");

    } finally {

      setBuscandoCep(false);

    }

  }



  // ===================================================

  // VALIDAR DADOS DO TITULAR

  // ===================================================



  function validarDadosTitular() {

    if (!formulario.nomeCompleto.trim()) {

      return "Informe o nome completo do titular.";

    }



    if (formulario.nomeCompleto.trim().split(/\s+/).length < 2) {

      return "Informe nome e sobrenome do titular.";

    }



    if (!validarCPF(formulario.cpf)) {

      return "Informe um CPF válido.";

    }



    if (!formulario.dataNascimento) {

      return "Informe a data de nascimento.";

    }



    if (!formulario.cidade.trim() || !formulario.estado) {

      return "Informe a cidade e o estado.";

    }



    if (somenteNumeros(formulario.telefone).length < 10) {

      return "Informe um telefone válido com DDD.";

    }



    if (somenteNumeros(formulario.celular).length < 10) {

      return "Informe um celular válido com DDD.";

    }



    if (

      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(

        formulario.email.trim()

      )

    ) {

      return "Informe um e-mail válido.";

    }



    if (!formulario.canalVenda) {

      return "Selecione o canal de venda.";

    }



    return "";

  }



  // ===================================================

  // DADOS DO CLIENTE PARA GRAVAÇÃO

  // ===================================================



  function obterDadosCliente() {

    const cpf = somenteNumeros(formulario.cpf);



    return {

      nomeCompleto: formulario.nomeCompleto.trim(),

      cpf,

      cpfNormalizado: cpf,

      dataNascimento: formulario.dataNascimento,

      sexo: formulario.sexo,

      profissao: formulario.profissao,

      estadoCivil: formulario.estadoCivil,

      escolaridade: formulario.escolaridade,

      nacionalidade: formulario.nacionalidade,

      nomeMae: formulario.nomeMae,

      nomePai: formulario.nomePai,

      cep: somenteNumeros(formulario.cep),

      endereco: formulario.endereco,

      numero: formulario.numero,

      complemento: formulario.complemento,

      bairro: formulario.bairro,

      estado: formulario.estado,

      cidade: formulario.cidade,

      telefone: somenteNumeros(formulario.telefone),

      celular: somenteNumeros(formulario.celular),

      celular2: somenteNumeros(formulario.celular2),

      whatsapp: somenteNumeros(formulario.whatsapp),

      email: formulario.email.trim().toLowerCase(),

      atualizadoEm: serverTimestamp(),

    };

  }



  // ===================================================

  // CRIAR CLIENTE E CONTRATO

  // ===================================================



  async function incluirContrato(evento) {
    evento.preventDefault();
    setErro("");
    setSucesso("");

    if (!usuario?.uid) {
      setErro("Sua sessão expirou. Entre novamente no sistema.");
      return;
    }
    const validacao = validarDadosTitular();
    if (validacao) {
      setErro(validacao);
      return;
    }

    setCarregando(true);
    try {
      const cpfNormalizado = somenteNumeros(formulario.cpf);
      const clientesRef = collection(db, "clientes");
      const resultadoCPF = await getDocs(query(clientesRef, where("cpfNormalizado", "==", cpfNormalizado)));

      if (resultadoCPF.size > 1) {
        throw new Error("Foram encontrados vários cadastros com este CPF. Corrija a duplicidade na base antes de continuar.");
      }

      const clienteExistente = !resultadoCPF.empty;
      const clienteRef = clienteExistente ? resultadoCPF.docs[0].ref : doc(clientesRef);
      let contratoRef;

      if (clienteExistente) {
        const contratosSnap = await getDocs(query(collection(db, "contratos"), where("clienteId", "==", clienteRef.id)));
        if (contratosSnap.size > 1) {
          throw new Error("Este cliente possui mais de um contrato vinculado. A inconsistência precisa ser corrigida antes de continuar; nenhum novo contrato foi criado.");
        }
        if (contratosSnap.empty) {
          throw new Error("Este CPF já pertence a um cliente, mas não encontramos um contrato vinculado. Verifique o cadastro existente antes de continuar.");
        }
        contratoRef = contratosSnap.docs[0].ref;
      } else {
        contratoRef = doc(collection(db, "contratos"));
      }

      const dadosCliente = obterDadosCliente();
      const dadosContrato = {
        contratoId: contratoRef.id,
        clienteId: clienteRef.id,
        clienteNome: formulario.nomeCompleto.trim(),
        clienteCPF: cpfNormalizado,
        vendedorId: usuario.uid,
        vendedorNome,
        departamentoId,
        departamentoNome: nomeDepartamento,
        canalVenda: formulario.canalVenda,
        origem: "sistema_interno",
        planoId: "",
        planoNome: "",
        valor: 0,
        periodicidade: "",
        formaPagamento: "",
        status: "Pendente",
        statusLabel: "Pendente",
        statusVenda: "Pendente",
        statusVendaLabel: "Pendente",
        pendenciaCadastro: "NÃO TEM CONTRATO ASSINADO",
        pendenciaCadastroLabel: "NÃO TEM CONTRATO ASSINADO",
        statusPagamento: "Não iniciado",
        statusPagamentoLabel: "Não iniciado",
        atualizadoEm: serverTimestamp(),
      };

      await runTransaction(db, async (transacao) => {
        const clienteAtual = await transacao.get(clienteRef);
        if (clienteExistente) {
          if (!clienteAtual.exists()) throw new Error("O cadastro do cliente não existe mais. Atualize a página e tente novamente.");
          const contratoAtual = await transacao.get(contratoRef);
          if (!contratoAtual.exists() || contratoAtual.data().clienteId !== clienteRef.id) {
            throw new Error("O contrato vinculado foi alterado ou não pertence a este cliente. Nenhuma alteração foi realizada.");
          }
          const dadosClienteAtual = clienteAtual.data();
          const dadosContratoAtual = contratoAtual.data();
          // Mantém os três eixos de situação independentes e sincronizados,
          // sem reiniciar o ciclo de venda ao editar um cadastro existente.
          const statusVenda = dadosContratoAtual.statusVenda || dadosContratoAtual.statusVendaLabel ||
            dadosContratoAtual.status || dadosContratoAtual.statusLabel ||
            dadosClienteAtual.statusVenda || dadosClienteAtual.statusVendaLabel ||
            dadosClienteAtual.status || dadosClienteAtual.statusLabel || "Pendente";
          const pendenciaCadastro = dadosContratoAtual.pendenciaCadastro ||
            dadosContratoAtual.pendenciaCadastroLabel ||
            dadosClienteAtual.pendenciaCadastro || dadosClienteAtual.pendenciaCadastroLabel ||
            "NÃO TEM CONTRATO ASSINADO";
          const statusPagamento = dadosContratoAtual.statusPagamento ||
            dadosContratoAtual.statusPagamentoLabel ||
            dadosClienteAtual.statusPagamento || dadosClienteAtual.statusPagamentoLabel ||
            "Não iniciado";
          const camposStatus = {
            status: statusVenda,
            statusLabel: statusVenda,
            statusVenda,
            statusVendaLabel: statusVenda,
            pendenciaCadastro,
            pendenciaCadastroLabel: pendenciaCadastro,
            statusPagamento,
            statusPagamentoLabel: statusPagamento,
          };
          transacao.update(clienteRef, { ...dadosCliente, ...camposStatus });
          transacao.update(contratoRef, {
            clienteNome: dadosContrato.clienteNome,
            clienteCPF: cpfNormalizado,
            canalVenda: formulario.canalVenda,
            ...camposStatus,
            atualizadoEm: serverTimestamp(),
          });
        } else {
          transacao.set(clienteRef, {
            ...dadosCliente,
            statusVenda: "Pendente",
            statusVendaLabel: "Pendente",
            status: "Pendente",
            statusLabel: "Pendente",
            pendenciaCadastro: "NÃO TEM CONTRATO ASSINADO",
            pendenciaCadastroLabel: "NÃO TEM CONTRATO ASSINADO",
            statusPagamento: "Não iniciado",
            statusPagamentoLabel: "Não iniciado",
            clienteId: clienteRef.id,
            contratoId: contratoRef.id,
            origemPrimeiroCadastro: "sistema_interno",
            criadoPor: usuario.uid,
            criadoPorNome: vendedorNome,
            criadoEm: serverTimestamp(),
          });
          transacao.set(contratoRef, { ...dadosContrato, criadoPor: usuario.uid, criadoEm: serverTimestamp() });
        }
      });

      setClienteId(clienteRef.id);
      setContratoId(contratoRef.id);
      const contratoSalvoSnap = await getDoc(contratoRef);
      const contratoSalvo = contratoSalvoSnap.exists() ? contratoSalvoSnap.data() : dadosContrato;
      setStatusContrato({
        statusVenda: contratoSalvo.statusVenda || contratoSalvo.statusVendaLabel || contratoSalvo.status || "Pendente",
        pendenciaCadastro: contratoSalvo.pendenciaCadastro || contratoSalvo.pendenciaCadastroLabel || "NÃO TEM CONTRATO ASSINADO",
        statusPagamento: contratoSalvo.statusPagamento || contratoSalvo.statusPagamentoLabel || "Não iniciado",
      });
      setModoEdicao(true);
      setAba("plano");

      const mensagemSucesso = clienteExistente
        ? `Cliente localizado e atualizado. O contrato existente foi mantido. Cliente ID: ${clienteRef.id} | Contrato ID: ${contratoRef.id}`
        : `Cadastro incluído! Cliente ID: ${clienteRef.id} | Contrato ID: ${contratoRef.id}`;

      setSucesso(mensagemSucesso);

      // O retorno à venda não pode depender de uma gravação secundária de histórico.
      if (fluxoVendaCarteirinha?.origem === "venda_carteirinha") {
        sessionStorage.setItem("vendaCarteirinhaRetorno", JSON.stringify({
          clienteId: clienteRef.id,
          contratoId: contratoRef.id,
          leadId: fluxoVendaCarteirinha.leadId || "",
          origem: clienteExistente ? "cliente_existente_reutilizado" : "novo_cliente_criado",
        }));
        sessionStorage.removeItem("fluxoVendaCarteirinha");

        try {
          await registrarHistorico({
            idCliente: clienteRef.id,
            idContrato: contratoRef.id,
            tipo: clienteExistente ? "reativacao_cadastro" : "criacao",
            descricao: clienteExistente
              ? "Cadastro do cliente localizado pelo CPF e dados do titular atualizados. O contrato existente foi reutilizado."
              : "Cadastro inicial do cliente e contrato realizado.",
            dados: clienteExistente ? {} : {
              statusVenda: "Pendente",
              status: "Pendente",
              statusLabel: "Pendente",
              pendenciaCadastro: "NÃO TEM CONTRATO ASSINADO",
              pendenciaCadastroLabel: "NÃO TEM CONTRATO ASSINADO",
              statusPagamento: "Não iniciado",
              statusPagamentoLabel: "Não iniciado",
            },
          });
        } catch (erroHistorico) {
          console.error("Cadastro salvo, mas houve falha ao registrar histórico:", erroHistorico);
        }

        if (typeof onNavigate === "function") {
          onNavigate("/vendas/carteirinha");
        } else {
          window.location.href = "/vendas/carteirinha";
        }
        return;
      }

      try {
        await registrarHistorico({
          idCliente: clienteRef.id,
          idContrato: contratoRef.id,
          tipo: clienteExistente ? "reativacao_cadastro" : "criacao",
          descricao: clienteExistente
            ? "Cadastro do cliente localizado pelo CPF e dados do titular atualizados. O contrato existente foi reutilizado."
            : "Cadastro inicial do cliente e contrato realizado.",
          dados: clienteExistente ? {} : {
            statusVenda: "Pendente",
            status: "Pendente",
            statusLabel: "Pendente",
            pendenciaCadastro: "NÃO TEM CONTRATO ASSINADO",
            pendenciaCadastroLabel: "NÃO TEM CONTRATO ASSINADO",
            statusPagamento: "Não iniciado",
            statusPagamentoLabel: "Não iniciado",
          },
        });
        await carregarRelacionados(contratoRef.id, clienteRef.id);
      } catch (erroSecundario) {
        console.error("Cadastro salvo, mas houve falha ao atualizar histórico/relacionados:", erroSecundario);
      }
    } catch (error) {
      console.error("Erro ao incluir contrato:", error);
      setErro(error.code === "permission-denied"
        ? "O Firebase bloqueou a gravação. Verifique as regras de segurança do Firestore."
        : error.message || "Não foi possível incluir o contrato.");
    } finally {
      setCarregando(false);
    }
  }


  // ===================================================

  // ATUALIZAR DADOS DO TITULAR

  // ===================================================



  async function atualizarDadosTitular(evento) {

    evento.preventDefault();



    setErro("");

    setSucesso("");



    const validacao = validarDadosTitular();



    if (validacao) {

      setErro(validacao);

      return;

    }



    if (!clienteId || !contratoId) {

      setErro("Não foi possível identificar o cliente ou contrato.");

      return;

    }



    setCarregando(true);



    try {

      const cpfNormalizado = somenteNumeros(formulario.cpf);



      // Verifica se o CPF já pertence a outro cliente.

      const consultaCPF = query(

        collection(db, "clientes"),

        where("cpfNormalizado", "==", cpfNormalizado)

      );



      const resultadoCPF = await getDocs(consultaCPF);



      const outroCliente = resultadoCPF.docs.find(

        (item) => item.id !== clienteId

      );



      if (outroCliente) {

        setErro("Este CPF já está cadastrado em outro cliente.");

        return;

      }



      const dadosCliente = obterDadosCliente();



      await runTransaction(db, async (transacao) => {

        const clienteRef = doc(db, "clientes", clienteId);

        const contratoRef = doc(db, "contratos", contratoId);



        const clienteSnap = await transacao.get(clienteRef);

        const contratoSnap = await transacao.get(contratoRef);



        if (!clienteSnap.exists()) {

          throw new Error("Cliente não encontrado.");

        }



        if (!contratoSnap.exists()) {

          throw new Error("Contrato não encontrado.");

        }



        transacao.update(clienteRef, dadosCliente);



        transacao.update(contratoRef, {

          clienteNome: formulario.nomeCompleto.trim(),

          clienteCPF: cpfNormalizado,

          canalVenda: formulario.canalVenda,

          atualizadoEm: serverTimestamp(),

        });

      });



      await registrarHistorico({ tipo: "atualizacao", descricao: "Dados do titular atualizados." });



      setSucesso("Dados do Contrato atualizados com sucesso.");



      await carregarRelacionados(contratoId);

    } catch (error) {

      console.error("Erro ao atualizar titular:", error);

      setErro(error.message || "Não foi possível atualizar o titular.");

    } finally {

      setCarregando(false);

    }

  }



  // ===================================================

  // SALVAR PLANO CONTRATADO

  // ===================================================



  async function salvarPlano(evento) {

    evento.preventDefault();



    setErro("");

    setSucesso("");



    if (!contratoId) {

      setErro("Inclua primeiro os dados do titular.");

      return;

    }



    if (!pagamento.planoId) {

      setErro("Selecione um plano.");

      return;

    }



    if (!pagamento.periodicidade) {

      setErro("Selecione a periodicidade do pagamento.");

      return;

    }



    if (!pagamento.formaPagamento) {

      setErro("Selecione a forma de pagamento.");

      return;

    }



    if (

      pagamento.valor === "" ||

      !Number.isFinite(Number(pagamento.valor)) ||

      Number(pagamento.valor) < 0

    ) {

      setErro("Informe um valor válido para o plano.");

      return;

    }



    setCarregando(true);



    try {

      await updateDoc(doc(db, "contratos", contratoId), {

        planoId: pagamento.planoId,

        planoNome: pagamento.planoNome,

        valor: Number(pagamento.valor),



        quantidadeDependentes: Number(

          pagamento.quantidadeDependentes || 0

        ),



        dependentesPlus: Number(

          pagamento.dependentesPlus || 0

        ),



        periodicidade: pagamento.periodicidade,

        formaPagamento: pagamento.formaPagamento,



        observacoesVendedor: pagamento.observacoesVendedor,



        dadosPagamento: {

          nomeInstalacao: pagamento.nomeInstalacao,

          numeroInstalacao: pagamento.numeroInstalacao,

          numeroClienteEnergia: pagamento.numeroClienteEnergia,

          nomeCartao: pagamento.nomeCartao,

          cartaoFinal: pagamento.cartaoFinal,

          vencimento: pagamento.vencimento,

          observacoes: pagamento.observacoesPagamento,

        },



        atualizadoEm: serverTimestamp(),

      });



      await registrarHistorico({ tipo: "plano", descricao: `Plano ${pagamento.planoNome} configurado. Pagamento: ${pagamento.periodicidade} / ${pagamento.formaPagamento}.` });



      setCvv("");
      setSucesso("Dados do plano salvos com sucesso.");



      await carregarRelacionados(contratoId);

    } catch (error) {

      console.error("Erro ao salvar plano:", error);

      setErro("Não foi possível salvar os dados do plano.");

    } finally {

      setCarregando(false);

    }

  }



  // ===================================================

  // INCLUIR DEPENDENTE

  // ===================================================



  async function incluirDependente(evento) {

    evento.preventDefault();



    setErro("");



    if (!contratoId) {

      setErro("Salve o contrato antes de incluir dependentes.");

      return;

    }



    if (!dependente.nome.trim() || !dependente.parentesco) {

      setErro("Informe o nome e o parentesco do dependente.");

      return;

    }



    if (dependente.cpf && !validarCPF(dependente.cpf)) {

      setErro("O CPF do dependente não é válido.");

      return;

    }



    setCarregando(true);



    try {

      const dependenteRef = await addDoc(

        collection(db, "contratos", contratoId, "dependentes"),

        {

          cpf: somenteNumeros(dependente.cpf),

          nome: dependente.nome.trim(),

          parentesco: dependente.parentesco,

          nascimento: dependente.nascimento,

          sexo: dependente.sexo,

          telefone: somenteNumeros(dependente.telefone),

          celular: somenteNumeros(dependente.celular),

          celular2: somenteNumeros(dependente.celular2),

          whatsapp: somenteNumeros(dependente.whatsapp),

          criadoPor: usuario.uid,

          criadoEm: serverTimestamp(),

        }

      );



      await registrarHistorico({ tipo: "dependente", descricao: `Dependente ${dependente.nome} incluído.`, dados: { dependenteId: dependenteRef.id } });



      setDependente(DEPENDENTE_INICIAL);

      setModalDependente(false);



      await carregarRelacionados(contratoId);



      setSucesso("Dependente incluído com sucesso.");

    } catch (error) {

      console.error("Erro ao incluir dependente:", error);

      setErro("Não foi possível incluir o dependente.");

    } finally {

      setCarregando(false);

    }

  }



  // ===================================================

  // EXCLUIR DEPENDENTE

  // ===================================================



  async function excluirDependente(id) {

    if (!window.confirm("Deseja excluir este dependente?")) {

      return;

    }



    try {

      await deleteDoc(

        doc(db, "contratos", contratoId, "dependentes", id)

      );



      await registrarHistorico({ tipo: "dependente", descricao: "Dependente removido do contrato." });



      await carregarRelacionados(contratoId);



      setSucesso("Dependente removido.");

    } catch (error) {

      console.error("Erro ao excluir dependente:", error);

      setErro("Não foi possível remover o dependente.");

    }

  }



  // ===================================================

  // REGISTRAR NOTIFICAÇÃO

  // ===================================================



  async function enviarNotificacao(evento) {

    evento.preventDefault();



    if (!notificacao.assunto.trim() || !notificacao.mensagem.trim()) {

      setErro("Preencha o assunto e a mensagem.");

      return;

    }



    try {

      await addDoc(

        collection(db, "contratos", contratoId, "notificacoes"),

        {

          assunto: notificacao.assunto.trim(),

          mensagem: notificacao.mensagem.trim(),

          status: "registrada",

          usuarioId: usuario.uid,

          usuarioNome: vendedorNome,

          criadoEm: serverTimestamp(),

        }

      );



      await registrarHistorico({ tipo: "notificacao", descricao: `Notificação registrada: ${notificacao.assunto}` });



      setNotificacao({

        assunto: "",

        mensagem: "",

      });



      await carregarRelacionados(contratoId);



      setSucesso("Notificação registrada com sucesso.");

    } catch (error) {

      console.error("Erro ao registrar notificação:", error);

      setErro("Não foi possível registrar a notificação.");

    }

  }



  // ===================================================

  // REGISTRAR COBRANÇA

  // ===================================================



  async function incluirCobranca(evento) {

    evento.preventDefault();



    if (!cobranca.valor || Number(cobranca.valor) <= 0) {

      setErro("Informe um valor de cobrança válido.");

      return;

    }



    if (!cobranca.formaPagamento) {

      setErro("Selecione a forma de pagamento.");

      return;

    }



    try {

      const cobrancaRef = await addDoc(

        collection(db, "contratos", contratoId, "cobrancas"),

        {

          valor: Number(cobranca.valor),

          periodicidade: cobranca.periodicidade,

          formaPagamento: cobranca.formaPagamento,

          descricao: cobranca.descricao,

          status: "pendente",

          criadoPor: usuario.uid,

          criadoPorNome: vendedorNome,

          criadoEm: serverTimestamp(),

        }

      );



      await registrarHistorico({ tipo: "cobranca", descricao: `Cobrança registrada no valor de ${dinheiro(cobranca.valor)}.`, dados: { cobrancaId: cobrancaRef.id } });



      setCobranca({

        valor: "",

        periodicidade: "",

        formaPagamento: "",

        descricao: "",

      });



      await carregarRelacionados(contratoId);



      setSucesso("Cobrança registrada como pendente.");

    } catch (error) {

      console.error("Erro ao registrar cobrança:", error);

      setErro("Não foi possível registrar a cobrança.");

    }

  }



  // ===================================================

  // ABRIR CONTRATO EXISTENTE PELO ID

  // ===================================================



    async function buscarContratoExistente(id, abaInicial = "dados") {

    if (!id.trim()) {

      setErro("Informe o ID do contrato.");

      return;

    }



    setErro("");

    setSucesso("");

    setCarregando(true);



    try {

      const contratoSnap = await getDoc(

        doc(db, "contratos", id.trim())

      );



      if (!contratoSnap.exists()) {

        setErro("Contrato não encontrado.");

        return;

      }



      const contrato = contratoSnap.data();
      const statusVenda = contrato.statusVenda || contrato.statusVendaLabel ||
        contrato.status || contrato.statusLabel || "Pendente";
      const pendenciaCadastro = contrato.pendenciaCadastro ||
        contrato.pendenciaCadastroLabel || "NÃO TEM CONTRATO ASSINADO";
      const statusPagamento = contrato.statusPagamento ||
        contrato.statusPagamentoLabel || "Não iniciado";

      setStatusContrato({ statusVenda, pendenciaCadastro, statusPagamento });

      const clienteSnap = await getDoc(

        doc(db, "clientes", contrato.clienteId)

      );



      if (!clienteSnap.exists()) {

        setErro("O cliente vinculado não foi encontrado.");

        return;

      }



      const cliente = clienteSnap.data();



      setClienteId(contrato.clienteId);

      setContratoId(id.trim());



      setFormulario({

        ...FORMULARIO_INICIAL,

        cpf: formatarCPF(cliente.cpf),

        nomeCompleto: cliente.nomeCompleto || "",

        dataNascimento: cliente.dataNascimento || "",

        sexo: cliente.sexo || "",

        profissao: cliente.profissao || "",

        estadoCivil: cliente.estadoCivil || "",

        escolaridade: cliente.escolaridade || "",

        nacionalidade: cliente.nacionalidade || "Brasileira",

        nomeMae: cliente.nomeMae || "",

        nomePai: cliente.nomePai || "",

        cep: cliente.cep || "",

        endereco: cliente.endereco || "",

        numero: cliente.numero || "",

        complemento: cliente.complemento || "",

        bairro: cliente.bairro || "",

        estado: cliente.estado || "",

        cidade: cliente.cidade || "",

        telefone: cliente.telefone || "",

        celular: cliente.celular || "",

        celular2: cliente.celular2 || "",

        whatsapp: cliente.whatsapp || "",

        email: cliente.email || "",

        canalVenda: contrato.canalVenda || "",

      });



      setPagamento({

        ...PAGAMENTO_INICIAL,

        planoId: contrato.planoId || "",

        planoNome: contrato.planoNome || "",

        valor: contrato.valor ?? "",

        quantidadeDependentes: contrato.quantidadeDependentes ?? 0,

        dependentesPlus: contrato.dependentesPlus ?? 0,

        periodicidade: contrato.periodicidade || "",

        formaPagamento: contrato.formaPagamento || "",

        observacoesVendedor: contrato.observacoesVendedor || "",

        ...(contrato.dadosPagamento || {}),

      });



            setModoEdicao(true);

      setAba(abaInicial);



      await carregarRelacionados(id.trim(), contrato.clienteId);

    } catch (error) {

      console.error("Erro ao abrir contrato:", error);

      setErro("Não foi possível abrir o contrato.");

    } finally {

      setCarregando(false);

    }

  }



  // ===================================================

  // ABAS

  // ===================================================

  // ===================================================
  // ABRIR CLIENTE PARA EDIÇÃO VINDO DA LISTAGEM
  // ===================================================

   useEffect(() => {
    // 1. Verifica se o vendedor quer continuar um contrato existente.
    const continuarSalvo = sessionStorage.getItem("continuarContratoVenda");

    if (continuarSalvo) {
      try {
        const dados = JSON.parse(continuarSalvo);

        sessionStorage.removeItem("continuarContratoVenda");

        if (dados?.contratoId && dados?.clienteId) {
          buscarContratoExistente(dados.contratoId, "plano");
          return;
        }
      } catch (error) {
        console.error("Erro ao continuar contrato:", error);
        sessionStorage.removeItem("continuarContratoVenda");
      }
    }

    // 2. Mantém a edição normal que vem da tela de clientes.
    const dadosSalvos = sessionStorage.getItem("clienteParaEditar");

    if (dadosSalvos) {
      try {
        const dados = JSON.parse(dadosSalvos);

        if (!dados?.contratoId || !dados?.clienteId) {
          console.error("Dados inválidos para edição:", dados);

          sessionStorage.removeItem("clienteParaEditar");

          setErro("Não foi possível identificar o cliente para edição.");

          return;
        }

        sessionStorage.removeItem("clienteParaEditar");

        buscarContratoExistente(dados.contratoId);

        return;
      } catch (error) {
        console.error("Erro ao iniciar edição do cliente:", error);

        sessionStorage.removeItem("clienteParaEditar");

        setErro("Não foi possível carregar os dados para edição.");

        return;
      }
    }

    // 3. Recebe os dados do lead para iniciar um novo cadastro.
    const fluxoSalvo = sessionStorage.getItem("fluxoVendaCarteirinha");

    if (!fluxoSalvo) return;

    try {
      const fluxo = JSON.parse(fluxoSalvo);

      setFluxoVendaCarteirinha(fluxo);

      const lead = fluxo.dadosLead || fluxo.lead || {};

      setFormulario((atual) => ({
        ...atual,

        cpf: formatarCPF(lead.cpf || ""),

        nomeCompleto:
          lead.nomeCompleto ||
          lead.nome ||
          "",

        email: lead.email || "",

        telefone: lead.telefone || "",

        celular:
          lead.celular ||
          lead.telefone ||
          "",

        whatsapp:
          lead.whatsapp ||
          lead.celular ||
          lead.telefone ||
          "",

        canalVenda: "Lead",
      }));
    } catch (error) {
      console.error("Erro ao carregar dados do lead:", error);

      sessionStorage.removeItem("fluxoVendaCarteirinha");

      setFluxoVendaCarteirinha(null);

      setErro("Não foi possível carregar os dados do lead.");
    }
  }, []);
  
  const abas = [

    { id: "dados", nome: "Dados do Contrato", Icone: FileText },

    { id: "plano", nome: "Plano Contratado", Icone: UserRound },

    { id: "dependentes", nome: "Dependentes", Icone: Users },

    { id: "notificacoes", nome: "Notificações e Alertas", Icone: Bell },

    { id: "cobrancas", nome: "Cobranças", Icone: Wallet },

    { id: "historico", nome: "Histórico", Icone: History },

  ];



  const dependentesFiltrados = dependentes.filter((item) =>

    `${item.nome || ""} ${item.cpf || ""} ${item.parentesco || ""}`

      .toLowerCase()

      .includes(busca.toLowerCase())

  );



  // ===================================================

  // ABA DADOS DO CONTRATO

  // ===================================================



  function renderDadosContrato() {

    return (

      <form

        onSubmit={

          modoEdicao

            ? atualizarDadosTitular

            : incluirContrato

        }

        className="nc-form"

      >

        <div className="nc-grade">

          <Campo

            label="Data Cadastro"

            value={dataAgora()}

            disabled

          />



          <Campo

            label="CPF (Titular)"

            name="cpf"

            value={formulario.cpf}

            onChange={(e) =>

              setFormulario((atual) => ({

                ...atual,

                cpf: formatarCPF(e.target.value),

              }))

            }

            required

          />



          <Campo

            label="Nome Completo (Titular)"

            name="nomeCompleto"

            value={formulario.nomeCompleto}

            onChange={atualizarFormulario}

            required

            className="nc-span-2"

          />



          <Campo

            label="Data de Nascimento"

            name="dataNascimento"

            type="date"

            value={formulario.dataNascimento}

            onChange={atualizarFormulario}

            required

          />



          <Campo

            label="Sexo"

            name="sexo"

            value={formulario.sexo}

            onChange={atualizarFormulario}

            options={[

              "Masculino",

              "Feminino",

              "Não informado",

            ]}

          />



          <Campo

            label="Profissão"

            name="profissao"

            value={formulario.profissao}

            onChange={atualizarFormulario}

            options={PROFISSOES}

            className="nc-span-2"

          />



          <Campo

            label="Estado Civil"

            name="estadoCivil"

            value={formulario.estadoCivil}

            onChange={atualizarFormulario}

            options={ESTADOS_CIVIS}

          />



          <Campo

            label="Escolaridade"

            name="escolaridade"

            value={formulario.escolaridade}

            onChange={atualizarFormulario}

            options={ESCOLARIDADES}

          />



          <Campo

            label="Nacionalidade"

            name="nacionalidade"

            value={formulario.nacionalidade}

            onChange={atualizarFormulario}

          />



          <Campo

            label="Nome da Mãe"

            name="nomeMae"

            value={formulario.nomeMae}

            onChange={atualizarFormulario}

            className="nc-span-2"

          />



          <Campo

            label="Nome do Pai"

            name="nomePai"

            value={formulario.nomePai}

            onChange={atualizarFormulario}

            className="nc-span-2"

          />



          <div className="nc-cep">

            <Campo

              label="CEP"

              name="cep"

              value={formulario.cep}

              onChange={atualizarFormulario}

              placeholder="00000-000"

            />



            <button

              type="button"

              className="nc-buscar"

              onClick={buscarCep}

              disabled={buscandoCep}

            >

              {buscandoCep ? (

                <LoaderCircle size={14} />

              ) : (

                <Search size={14} />

              )}

              Buscar

            </button>

          </div>



          <Campo

            label="Endereço"

            name="endereco"

            value={formulario.endereco}

            onChange={atualizarFormulario}

            className="nc-span-2"

          />



          <Campo

            label="Número"

            name="numero"

            value={formulario.numero}

            onChange={atualizarFormulario}

          />



          <Campo

            label="Complemento"

            name="complemento"

            value={formulario.complemento}

            onChange={atualizarFormulario}

          />



          <Campo

            label="Bairro"

            name="bairro"

            value={formulario.bairro}

            onChange={atualizarFormulario}

            className="nc-span-2"

          />



          <Campo

            label="Estado"

            name="estado"

            value={formulario.estado}

            onChange={atualizarFormulario}

            options={ESTADOS}

          />



          <Campo

            label="Cidade"

            name="cidade"

            value={formulario.cidade}

            onChange={atualizarFormulario}

            className="nc-span-2"

          />



          <Campo

            label="Telefone"

            name="telefone"

            value={formulario.telefone}

            onChange={(e) =>

              setFormulario((atual) => ({

                ...atual,

                telefone: formatarTelefone(e.target.value),

              }))

            }

          />



          <Campo

            label="Celular"

            name="celular"

            value={formulario.celular}

            onChange={(e) =>

              setFormulario((atual) => ({

                ...atual,

                celular: formatarTelefone(e.target.value),

              }))

            }

          />



          <Campo

            label="Celular 2"

            name="celular2"

            value={formulario.celular2}

            onChange={(e) =>

              setFormulario((atual) => ({

                ...atual,

                celular2: formatarTelefone(e.target.value),

              }))

            }

          />



          <Campo

            label="Whatsapp"

            name="whatsapp"

            value={formulario.whatsapp}

            onChange={(e) =>

              setFormulario((atual) => ({

                ...atual,

                whatsapp: formatarTelefone(e.target.value),

              }))

            }

          />



          <Campo

            label="E-mail"

            name="email"

            type="email"

            value={formulario.email}

            onChange={atualizarFormulario}

            className="nc-span-2"

          />



          <Campo

            label="Canal de Venda"

            name="canalVenda"

            value={formulario.canalVenda}

            onChange={atualizarFormulario}

            options={CANAIS_VENDA}

            required

          />



          <Campo

            label="Vendedor"

            value={vendedorNome}

            disabled

          />

        </div>



        {nomeDepartamento && (

          <div className="nc-info">

            Departamento vinculado:{" "}

            <strong>{nomeDepartamento}</strong>

          </div>

        )}



        <div className="nc-acoes">

          <button

            type="submit"

            className="nc-botao nc-primario"

            disabled={carregando}

          >

            {carregando ? (

              <LoaderCircle size={15} />

            ) : (

              <Save size={15} />

            )}



            {carregando

              ? "Salvando..."

              : modoEdicao

                ? "Salvar Alterações"

                : "Incluir Contrato"}

          </button>

        </div>

      </form>

    );

  }



  // ===================================================

  // ABA PLANO CONTRATADO

  // ===================================================



  function renderPlano() {

    return (

      <form onSubmit={salvarPlano} className="nc-form">

        <div className="nc-grade nc-grade-plano">

          <Campo

            label="Plano"

            name="planoId"

            value={pagamento.planoId}

            onChange={atualizarPagamento}

            options={planos.map((plano) => ({

              value: plano.id,

              label: plano.nome || plano.titulo || "Plano sem nome",

            }))}

            required

          />



          <Campo

            label="Valor"

            name="valor"

            type="number"

            value={pagamento.valor}

            onChange={atualizarPagamento}

            required

          />



          <Campo

            label="Dependentes"

            name="quantidadeDependentes"

            type="number"

            value={pagamento.quantidadeDependentes}

            onChange={atualizarPagamento}

          />



          <Campo

            label="Dep. Plus"

            name="dependentesPlus"

            type="number"

            value={pagamento.dependentesPlus}

            onChange={atualizarPagamento}

          />



          <Campo

            label="Pagamento"

            name="periodicidade"

            value={pagamento.periodicidade}

            onChange={atualizarPagamento}

            options={PERIODICIDADES}

            required

          />



          <Campo

            label="Forma de Pagamento"

            name="formaPagamento"

            value={pagamento.formaPagamento}

            onChange={atualizarPagamento}

            options={FORMAS_PAGAMENTO}

            required

          />

        </div>



        {["ENEL", "EDP"].includes(pagamento.formaPagamento) && (

          <div className="nc-grade nc-grade-extra">

            <Campo

              label="Nome do Titular da Conta"

              name="nomeInstalacao"

              value={pagamento.nomeInstalacao}

              onChange={atualizarPagamento}

            />



            <Campo

              label="Nº de Instalação"

              name="numeroInstalacao"

              value={pagamento.numeroInstalacao}

              onChange={atualizarPagamento}

            />



            <Campo

              label="Nº do Cliente"

              name="numeroClienteEnergia"

              value={pagamento.numeroClienteEnergia}

              onChange={atualizarPagamento}

            />

          </div>

        )}



        {pagamento.formaPagamento === "Cartão" && (

          <div className="nc-grade nc-grade-extra">

            <Campo

              label="Nome Completo no Cartão"

              name="nomeCartao"

              value={pagamento.nomeCartao}

              onChange={atualizarPagamento}

            />



            <Campo

              label="Últimos 4 dígitos do cartão"

              name="cartaoFinal"

              value={pagamento.cartaoFinal}

              onChange={atualizarPagamento}

              placeholder="0000"

            />



            <Campo

              label="Vencimento"

              name="vencimento"

              value={pagamento.vencimento}

              onChange={atualizarPagamento}

              placeholder="Dia do vencimento"

            />



            <label className="nc-campo">
              <span>CVV</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={cvv}
                onChange={(e) => setCvv(somenteNumeros(e.target.value).slice(0, 4))}
                placeholder="Código de segurança"
              />
            </label>

          </div>

        )}



        <div className="nc-plano-resumo">

          <div>

            <span>Plano selecionado</span>

            <strong>

              {pagamento.planoNome || "Nenhum plano selecionado"}

            </strong>

          </div>



          <div>

            <span>Valor informado</span>

            <strong>{dinheiro(pagamento.valor)}</strong>

          </div>



          <div>

            <span>Dependentes cadastrados</span>

            <strong>{dependentes.length}</strong>

          </div>

        </div>



        <label className="nc-campo nc-observacoes">

          <span>Observações do Vendedor</span>



          <textarea

            name="observacoesVendedor"

            value={pagamento.observacoesVendedor}

            onChange={atualizarPagamento}

            rows={4}

          />

        </label>



        {carregandoPlanos && (

          <p className="nc-aviso">Carregando planos...</p>

        )}



        {!carregandoPlanos && planos.length === 0 && (

          <p className="nc-aviso">

            Nenhum plano ativo encontrado na coleção "planos" do Firestore.

          </p>

        )}



        <div className="nc-acoes">

          <button

            className="nc-botao nc-primario"

            disabled={carregando}

          >

            <Save size={15} />

            Salvar Alterações

          </button>

        </div>

      </form>

    );

  }



  // ===================================================

  // ABA DEPENDENTES

  // ===================================================



  function renderDependentes() {

    return (

      <div className="nc-listagem">

        <div className="nc-listagem-topo">

          <label>

            Mostrar

            <select defaultValue="10">

              <option>10</option>

              <option>25</option>

              <option>50</option>

            </select>

            registros

          </label>



          <input

            placeholder="Buscar..."

            value={busca}

            onChange={(e) => setBusca(e.target.value)}

          />

        </div>



        <div className="nc-tabela-vazia">

          <table>

            <thead>

              <tr>

                <th>#</th>

                <th>CPF</th>

                <th>Nome</th>

                <th>Parentesco</th>

                <th>Nascimento</th>

                <th>Sexo</th>

                <th>Celular</th>

                <th>Opções</th>

              </tr>

            </thead>



            <tbody>

              {dependentesFiltrados.length === 0 ? (

                <tr>

                  <td colSpan="8">

                    Nenhum dependente cadastrado.

                  </td>

                </tr>

              ) : (

                dependentesFiltrados.map((item, index) => (

                  <tr key={item.id}>

                    <td>{index + 1}</td>

                    <td>{formatarCPF(item.cpf)}</td>

                    <td>{item.nome}</td>

                    <td>{item.parentesco}</td>

                    <td>{item.nascimento || "-"}</td>

                    <td>{item.sexo || "-"}</td>

                    <td>{item.celular || "-"}</td>

                    <td>

                      <button

                        className="nc-icone-excluir"

                        type="button"

                        onClick={() => excluirDependente(item.id)}

                        title="Excluir dependente"

                      >

                        <Trash2 size={15} />

                      </button>

                    </td>

                  </tr>

                ))

              )}

            </tbody>

          </table>

        </div>



        <div className="nc-listagem-rodape">

          <span>

            {dependentesFiltrados.length} dependente(s)

          </span>



          <button

            className="nc-botao nc-primario"

            type="button"

            onClick={() => setModalDependente(true)}

          >

            <Plus size={15} />

            Incluir Dependente

          </button>

        </div>

      </div>

    );

  }



  // ===================================================

  // ABA NOTIFICAÇÕES

  // ===================================================



  function renderNotificacoes() {

    return (

      <div className="nc-listagem">

        <h3>Notificações registradas</h3>



        {notificacoes.length === 0 ? (

          <p className="nc-aviso">

            Nenhuma notificação encontrada.

          </p>

        ) : (

          notificacoes.map((item) => (

            <div className="nc-registro" key={item.id}>

              <strong>{item.assunto}</strong>

              <p>{item.mensagem}</p>

              <small>

                {item.usuarioNome} · {item.status} ·{" "}

                {dataLegivel(item.criadoEm)}

              </small>

            </div>

          ))

        )}



        <form

          className="nc-form-registro"

          onSubmit={enviarNotificacao}

        >

          <h3>Registrar Notificação</h3>



          <Campo

            label="Assunto"

            value={notificacao.assunto}

            onChange={(e) =>

              setNotificacao((atual) => ({

                ...atual,

                assunto: e.target.value,

              }))

            }

          />



          <label className="nc-campo">

            <span>Mensagem</span>



            <textarea

              rows={4}

              value={notificacao.mensagem}

              onChange={(e) =>

                setNotificacao((atual) => ({

                  ...atual,

                  mensagem: e.target.value,

                }))

              }

            />

          </label>



          <div className="nc-acoes">

            <button className="nc-botao nc-primario">

              Registrar Notificação

            </button>

          </div>

        </form>

      </div>

    );

  }



  // ===================================================

  // ABA COBRANÇAS

  // ===================================================



  function renderCobrancas() {

    return (

      <div className="nc-listagem">

        <div className="nc-tabela-vazia">

          <table>

            <thead>

              <tr>

                <th>Valor</th>

                <th>Forma de Pagamento</th>

                <th>Periodicidade</th>

                <th>Data/Hora</th>

                <th>Status</th>

                <th>Descrição</th>

              </tr>

            </thead>



            <tbody>

              {cobrancas.length === 0 ? (

                <tr>

                  <td colSpan="6">

                    Nenhuma cobrança registrada.

                  </td>

                </tr>

              ) : (

                cobrancas.map((item) => (

                  <tr key={item.id}>

                    <td>{dinheiro(item.valor)}</td>

                    <td>{item.formaPagamento}</td>

                    <td>{item.periodicidade || "-"}</td>

                    <td>{dataLegivel(item.criadoEm)}</td>

                    <td>{item.status}</td>

                    <td>{item.descricao || "-"}</td>

                  </tr>

                ))

              )}

            </tbody>

          </table>

        </div>



        <form

          className="nc-form-registro"

          onSubmit={incluirCobranca}

        >

          <h3>Adicionar Cobrança</h3>



          <div className="nc-grade nc-grade-extra">

            <Campo

              label="Valor"

              type="number"

              value={cobranca.valor}

              onChange={(e) =>

                setCobranca((atual) => ({

                  ...atual,

                  valor: e.target.value,

                }))

              }

            />



            <Campo

              label="Pagamento"

              value={cobranca.periodicidade}

              onChange={(e) =>

                setCobranca((atual) => ({

                  ...atual,

                  periodicidade: e.target.value,

                }))

              }

              options={PERIODICIDADES}

            />



            <Campo

              label="Forma de Pagamento"

              value={cobranca.formaPagamento}

              onChange={(e) =>

                setCobranca((atual) => ({

                  ...atual,

                  formaPagamento: e.target.value,

                }))

              }

              options={FORMAS_PAGAMENTO}

            />

          </div>



          <Campo

            label="Descrição"

            value={cobranca.descricao}

            onChange={(e) =>

              setCobranca((atual) => ({

                ...atual,

                descricao: e.target.value,

              }))

            }

          />



          <div className="nc-acoes">

            <button className="nc-botao nc-primario">

              Registrar Cobrança

            </button>

          </div>

        </form>

      </div>

    );

  }



  // ===================================================

  // ABA HISTÓRICO

  // ===================================================



  function renderHistorico() {

    return (

      <div className="nc-listagem">

        {historico.length === 0 ? (

          <p className="nc-aviso">

            Nenhum histórico registrado.

          </p>

        ) : (

          historico.map((item) => (

            <div className="nc-registro" key={item.id}>

              <strong>{item.tipo}</strong>

              <p>{item.descricao}</p>

              <small>

                {item.usuarioNome || "Sistema"} ·{" "}

                {dataLegivel(item.criadoEm)}

              </small>

            </div>

          ))

        )}

      </div>

    );

  }



  // ===================================================

  // RENDERIZAR ABA SELECIONADA

  // ===================================================



  function renderAba() {

    switch (aba) {

      case "dados":

        return renderDadosContrato();



      case "plano":

        return renderPlano();



      case "dependentes":

        return renderDependentes();



      case "notificacoes":

        return renderNotificacoes();



      case "cobrancas":

        return renderCobrancas();



      case "historico":

        return renderHistorico();



      default:

        return null;

    }

  }



  // ===================================================

  // TELA

  // ===================================================



  return (

    <main className="novo-contrato">

      <header className="nc-cabecalho-pagina">

        <div>

          <h1>

            {modoEdicao

              ? `Editar Contrato - #${contratoId.slice(0, 8)} - ${formulario.nomeCompleto}`

              : "Incluir Contrato"}

          </h1>



          <div className="nc-breadcrumb">

            <button

              type="button"

              onClick={() => onNavigate?.("/painel")}

            >

              Painel

            </button>



            <span>/</span>



            <button

              type="button"

              onClick={() => onNavigate?.("/contratos/todos")}

            >

              Contratos

            </button>



            <span>/</span>



            <strong>

              {modoEdicao ? "Editar Contrato" : "Incluir Contrato"}

            </strong>

          </div>

        </div>

      </header>



      <section className="nc-conteudo">

        {modoEdicao && (

          <div className="nc-identificadores">

            <span>

              Cliente ID: <strong>{clienteId}</strong>

            </span>



            <span>

              Contrato ID: <strong>{contratoId}</strong>

            </span>



            <span className="nc-status-resumo">
              <CheckCircle2 size={14} />
              {statusContrato.statusVenda || "Pendente"}
              <small>
                {statusContrato.pendenciaCadastro} · Pagamento: {statusContrato.statusPagamento}
              </small>
            </span>

          </div>

        )}



        <nav className="nc-abas">

          {abas.map(({ id, nome, Icone }) => (

            <button

              type="button"

              key={id}

              className={aba === id ? "ativo" : ""}

              disabled={!modoEdicao && id !== "dados"}

              onClick={() => {

                setAba(id);

                setErro("");

                setSucesso("");

              }}

            >

              <Icone size={14} />

              {nome}

            </button>

          ))}

        </nav>



        <section className="nc-painel">

          <div className="nc-painel-titulo">

            {abas.find((item) => item.id === aba)?.nome}

          </div>



          {erro && (

            <div className="nc-alerta nc-erro">

              {erro}

            </div>

          )}



          {sucesso && (

            <div className="nc-alerta nc-sucesso">

              {sucesso}

            </div>

          )}



          {renderAba()}

        </section>

      </section>



      {/* MODAL DE DEPENDENTE */}



      {modalDependente && (

        <div

          className="nc-modal-fundo"

          onMouseDown={(e) => {

            if (e.target === e.currentTarget) {

              setModalDependente(false);

            }

          }}

        >

          <form

            className="nc-modal"

            onSubmit={incluirDependente}

          >

            <header>

              <h2>

                <Plus size={18} />

                Adicionar Dependente

              </h2>



              <button

                type="button"

                onClick={() => setModalDependente(false)}

              >

                ×

              </button>

            </header>



            <div className="nc-grade nc-modal-grade">

              <Campo

                label="CPF"

                value={dependente.cpf}

                onChange={(e) =>

                  setDependente((atual) => ({

                    ...atual,

                    cpf: formatarCPF(e.target.value),

                  }))

                }

              />



              <Campo

                label="Nome Completo"

                value={dependente.nome}

                onChange={(e) =>

                  setDependente((atual) => ({

                    ...atual,

                    nome: e.target.value,

                  }))

                }

                required

                className="nc-span-2"

              />



              <Campo

                label="Parentesco"

                value={dependente.parentesco}

                onChange={(e) =>

                  setDependente((atual) => ({

                    ...atual,

                    parentesco: e.target.value,

                  }))

                }

                options={PARENTESCOS}

                required

              />



              <Campo

                label="Data de Nascimento"

                type="date"

                value={dependente.nascimento}

                onChange={(e) =>

                  setDependente((atual) => ({

                    ...atual,

                    nascimento: e.target.value,

                  }))

                }

              />



              <Campo

                label="Sexo"

                value={dependente.sexo}

                onChange={(e) =>

                  setDependente((atual) => ({

                    ...atual,

                    sexo: e.target.value,

                  }))

                }

                options={[

                  "Masculino",

                  "Feminino",

                  "Não informado",

                ]}

              />



              <Campo

                label="Telefone"

                value={dependente.telefone}

                onChange={(e) =>

                  setDependente((atual) => ({

                    ...atual,

                    telefone: formatarTelefone(e.target.value),

                  }))

                }

              />



              <Campo

                label="Celular"

                value={dependente.celular}

                onChange={(e) =>

                  setDependente((atual) => ({

                    ...atual,

                    celular: formatarTelefone(e.target.value),

                  }))

                }

              />



              <Campo

                label="Celular 2"

                value={dependente.celular2}

                onChange={(e) =>

                  setDependente((atual) => ({

                    ...atual,

                    celular2: formatarTelefone(e.target.value),

                  }))

                }

              />



              <Campo

                label="Whatsapp"

                value={dependente.whatsapp}

                onChange={(e) =>

                  setDependente((atual) => ({

                    ...atual,

                    whatsapp: formatarTelefone(e.target.value),

                  }))

                }

              />

            </div>



            <footer>

              <button

                type="button"

                className="nc-botao nc-secundario"

                onClick={() => setModalDependente(false)}

              >

                Cancelar

              </button>



              <button

                className="nc-botao nc-primario"

                disabled={carregando}

              >

                {carregando ? "Salvando..." : "Incluir"}

              </button>

            </footer>

          </form>

        </div>

      )}

    </main>

  );

}
