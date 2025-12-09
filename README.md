# POE2 Campaign Overlay

Um overlay para Path of Exile 2 que facilita o acompanhamento de quests da campanha e suas respectivas recompensas.

Criado por [Guilherme Capitão](https://github.com/guilhermecapitao)

## Funcionalidades

- **Overlay Transparente**: Acompanhe suas quests sem sair do jogo
- **Sistema de Cores**: Identifique rapidamente quests importantes, opcionais e críticas
- **Múltiplas Runs**: Gerencie o progresso de diferentes personagens
- **Multi-idioma**: Suporte para Português e Inglês
- **Performance**: Uso mínimo de recursos
- **Atalhos Customizáveis**: Configure seus próprios atalhos (padrão: Alt+F)
- **Posição e Tamanho Ajustáveis**: Arraste e redimensione o overlay como preferir

## Screenshots

*Em breve*

## Instalação

### Download

Baixe a versão mais recente na página de [Releases](https://github.com/guilhermecapitao/poe2-cap-overlay/releases).

### Executando

1. Baixe o arquivo correspondente ao seu sistema operacional
2. Execute o aplicativo
3. Use `Alt+F` para abrir/fechar o overlay enquanto joga

## Desenvolvimento

### Pré-requisitos

- Node.js 18+
- npm

### Setup

```bash
# Clone o repositório
git clone https://github.com/guilhermecapitao/poe2-cap-overlay.git

# Entre na pasta
cd poe2-cap-overlay

# Instale as dependências
npm install

# Compile o TypeScript
npm run build

# Execute a aplicação
npm start
```

### Scripts disponíveis

```bash
npm run build      # Compila TypeScript
npm run build:watch # Compila com watch mode
npm start          # Executa a aplicação
npm run dist       # Gera executáveis para distribuição
```

## Sistema de Cores

| Cor | Significado |
|-----|-------------|
| Vermelho | Quests obrigatórias para progresso |
| Amarelo | Quests com recompensas importantes (resistências, buffs, passivas) |
| Verde | Quests opcionais |
| Cinza | Quests normais |

## Tecnologias

- [Electron](https://www.electronjs.org/) - Framework para aplicações desktop
- TypeScript
- HTML/CSS (Vanilla)

## Contribuindo

Este projeto é **open source** e contribuições são bem-vindas!

### Como contribuir

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

### Reportando bugs

Encontrou um bug? Abra uma [issue](https://github.com/guilhermecapitao/poe2-cap-overlay/issues) descrevendo:

- O que aconteceu
- O que era esperado
- Passos para reproduzir
- Sistema operacional e versão do app

## Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## Agradecimentos

- Comunidade Path of Exile 2
- Todos os contribuidores do projeto
