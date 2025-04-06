# Wallpaper Jigsaw Puzzle Game

An interactive jigsaw puzzle game based on Angular, supporting multiple difficulty levels and customizable puzzle parameters.

## Project Introduction

This is a wallpaper jigsaw puzzle game application developed using the Angular framework. The game divides a wallpaper image into multiple puzzle pieces with jagged edges, and players can complete the puzzle by dragging these pieces.

## Features

- Multiple difficulty levels (Easy, Medium, Hard, Expert, Master)
- Customizable puzzle parameters
- Support for both mouse and touch screen operations
- Responsive design, adapting to different devices
- Puzzle pieces with realistic jagged edge effects
- Drag and drop functionality, allowing free movement of puzzle pieces within the canvas

## Technology Stack

- Angular
- TypeScript
- HTML5 Canvas
- ng-zorro-antd UI library

## Installation

1. Clone the repository
```bash
git clone git@github.com:ifuyun/wallpaper-jigsaw.git
cd wallpaper-jigsaw
```

2. Install dependencies
```bash
npm install
```

3. Start the development server
```bash
npm run start
```

4. Visit `http://localhost:4200/` in your browser

## Usage Guide

### Difficulty Levels

The game offers five difficulty levels, each corresponding to a different number of puzzle pieces:

- Easy: 6×9 pieces
- Medium: 8×12 pieces
- Hard: 12×18 pieces
- Expert: 16×24 pieces
- Master: 20×30 pieces

### Custom Parameters

You can adjust the following parameters to customize the puzzle effect:

- Random Seed: Controls the random generation of puzzle pieces
- Tab Size: Controls the size of the puzzle piece tabs (10-30%)
- Jitter: Controls the irregularity of the jagged edges (0-13%)

### Operation Method

- Click and drag puzzle pieces to move them
- Puzzle pieces automatically stay within the canvas boundaries
- The puzzle is completed when all pieces are placed in the correct position

## License

MIT License

## Contribution Guidelines

Issues and feature requests are welcome. If you want to contribute code, please first create an issue to discuss what you would like to change.

## Contact Information

If you have any questions or suggestions, please contact:

- 网站: [https://www.ifuyun.com/](https://www.ifuyun.com/)
- GitHub: [ifuyun](https://github.com/ifuyun)
