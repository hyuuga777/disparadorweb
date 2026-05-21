# WPP AI Assistant - Spa Limão 🍋

Uma extensão de automação e assistência inteligente (IA) via Gemini 1.5 Flash para responder contatos no WhatsApp Web com base em uma lista (CSV).

## 🚀 Funcionalidades

- **Envio de Mensagens em Lote**: Importe um CSV (Nome, Telefone) e dispare mensagens personalizadas.
- **Inteligência Artificial (Gemini API)**: Reescreve mensagens de forma elegante e adaptada a cada cliente, com zero complexidade (apenas defina sua API Key).
- **Suporte a Mídia**: Envie Imagem, Vídeo ou Áudio junto com a mensagem.
- **Design Moderno (Glassmorphism)**: Interface clean e premium no formato popup.

## 🛡️ Sistema Anti-Ban Avançado

A versão 1.0.0 introduziu um sistema anti-banimento aprimorado projetado para imitar perfeitamente o **comportamento humano** no envio em lote. 

A fórmula matemática de atraso (delay) obedece à seguinte regra:
`Total Delay = Base + (Caracteres * 50ms) + Jitter (15.000ms a 47.000ms)`

### O que isso significa na prática?
1. **Pausa para Digitação**: Um atraso inteligente de `50ms` para cada caractere gerado.
2. **Jitter Extremo**: Após calcular a "digitação", adiciona-se entre **15s e 47s** aleatoriamente em cada envio.
3. Isso garante que nunca existam dois disparos sequenciais sob o mesmo ritmo de segundos, burlando eficientemente algoritmos preditivos de bot (excesso de requisições fixas).

## 💻 Instalação / Como usar (Vanilla Version)

Nossa arquitetura roda 100% nativa (Vanilla JS) diretamente no navegador, dispensando *builds* de React/Vite.

1. Baixe o repositório.
2. Acesse `chrome://extensions` no seu Google Chrome ou Edge.
3. Ative o **Modo do Desenvolvedor**.
4. Clique em **"Carregar sem compactação"** e selecione a pasta da extensão (este diretório).
5. Pronto! Fixe o ícone `🍋` no navegador e abra seu WhatsApp Web.

## ⚙️ Configuração da IA

Na aba "Inteligência Artificial" da extensão:
1. Ative a chave.
2. Insira sua **Gemini API Key**.
3. (Certifique-se de que sua chave possui os devidos acessos da Google AI Studio no modelo `gemini-1.5-flash`).
