import { NgFor, NgIf } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { shuffle } from 'lodash';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzImageService } from 'ng-zorro-antd/image';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { GameStatus, JigsawDifficulty, JigsawDifficultyItem, JigsawPiece } from './jigsaw.interface';
import { JigsawService } from './jigsaw.service';

@Component({
  selector: 'app-jigsaw',
  imports: [NgIf, NgFor, FormsModule, NzSelectModule, NzButtonModule, NzIconModule, NzDropDownModule],
  providers: [NzImageService],
  templateUrl: './jigsaw.component.html',
  styleUrl: './jigsaw.component.less'
})
export class JigsawComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() puzzleImage = 'https://cn.bing.com/th?id=OHR.SummerSolstice2024_ZH-CN6141918663_1920x1080.jpg';
  // 画布尺寸
  @Input() canvasWidth = 1050;
  @Input() canvasHeight = 700;

  @ViewChild('previewCanvas') previewRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('puzzleCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  // 难度级别
  difficultyLevels: Record<JigsawDifficulty, JigsawDifficultyItem> = {
    easy: { rows: 6, cols: 9, label: '简单' },
    medium: { rows: 8, cols: 12, label: '中等' },
    hard: { rows: 12, cols: 18, label: '困难' },
    expert: { rows: 16, cols: 24, label: '专家' },
    master: { rows: 20, cols: 30, label: '大师' }
  };
  // 当前难度级别
  activeDifficulty: JigsawDifficulty = 'medium';
  // 游戏状态相关
  gameStatus: GameStatus = 'ready';
  gameTime = 0; // 游戏时间（秒）

  get difficultyList(): JigsawDifficultyItem[] {
    return Object.entries(this.difficultyLevels).map(([name, value]) => ({
      ...value,
      name: <JigsawDifficulty>name
    }));
  }

  // 原图尺寸
  private wallpaperWidth = 1920;
  private wallpaperHeight = 1080;
  private wallpaperRatio = this.wallpaperWidth / this.wallpaperHeight;
  // 拼图尺寸
  private puzzleWidth = 900;
  private puzzleHeight = 600;
  private puzzleRatio = this.puzzleWidth / this.puzzleHeight;
  // 拼图块数组
  private puzzlePieces: JigsawPiece[] = [];
  // 原始图片
  private originalImage: HTMLImageElement | null = null;
  // 裁剪、缩放后的原始图片
  private scaledImage: HTMLImageElement | null = null;
  private seed = Math.floor(Math.random() * 10000); // 随机种子
  // 锯齿参数
  private tabSize = 20; // 锯齿大小百分比 (10-30)
  private jitter = 4; // 锯齿抖动百分比 (0-13)
  // 拖拽相关
  private isDragging = false;
  private selectedPiece: JigsawPiece | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  // 画布拖拽相关
  private isCanvasDragging = false;
  private lastDragX = 0;
  private lastDragY = 0;
  // 拼接相关
  private snapThreshold = 16; // 吸附阈值（像素）
  private connectedGroups: JigsawPiece[][] = []; // 已连接的拼图块组
  // 计时器相关
  private timerInterval: number | null = null; // 计时器
  private lastTimestamp = 0; // 上次更新时间戳
  // 缩放相关
  private zoomScale = 1; // 累积缩放比例
  private zoomStep = 0.1; // 每次缩放步长
  private minZoom = Math.pow(1 / (1 + this.zoomStep), 7); // 最小缩放比例
  private maxZoom = Math.pow(1 + this.zoomStep, 7); // 最大缩放比例

  constructor(
    private readonly jigsawService: JigsawService,
    private readonly message: NzMessageService,
    private readonly imageService: NzImageService
  ) {}

  ngOnInit() {
    // 初始化代码
    this.jigsawService.setSeed(this.seed);
    this.jigsawService.setTabSize(this.tabSize);
    this.jigsawService.setJitter(this.jitter);
  }

  ngAfterViewInit() {
    this.initCanvas();
    this.initCanvasEvents();

    // 添加页面可见性变化监听
    document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    window.addEventListener('pagehide', this.handleVisibilityChange.bind(this));
  }

  ngOnDestroy() {
    // 清除计时器
    this.stopTimer();

    // 移除页面可见性变化监听
    document.removeEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    window.removeEventListener('pagehide', this.handleVisibilityChange.bind(this));
  }

  // 切换难度级别
  setDifficulty(difficulty: JigsawDifficulty) {
    this.activeDifficulty = difficulty;
  }

  // 设置锯齿参数
  setPuzzleParams(seed: number, tabSize: number, jitter: number) {
    this.seed = seed;
    this.tabSize = tabSize;
    this.jitter = jitter;

    this.initPuzzle();
  }

  // 开始游戏
  startGame() {
    const isNewGame = this.gameStatus === 'ready';

    if (isNewGame) {
      // 重置游戏时间
      this.gameTime = 0;

      // 如果是新游戏，重新生成拼图块
      this.initPuzzle();
    }

    this.gameStatus = 'playing';
    this.startTimer();
  }

  // 暂停游戏
  pauseGame() {
    if (this.gameStatus === 'playing') {
      this.gameStatus = 'paused';

      this.stopTimer();
      // 在暂停状态下显示原始图片
      this.drawOriginalImage(false);
    }
  }

  // 恢复游戏
  resumeGame() {
    if (this.gameStatus === 'paused') {
      this.gameStatus = 'playing';

      this.startTimer();
      // 恢复显示拼图
      this.renderPuzzle();
    }
  }

  // 重新开始游戏
  restartGame() {
    // 重置游戏状态
    this.gameStatus = 'ready';
    this.gameTime = 0;
    this.zoomScale = 1;

    this.stopTimer();
    // 重新生成拼图
    this.initPuzzle();
    // 自动开始游戏
    this.startGame();
  }

  // 停止游戏
  stopGame() {
    if (this.gameStatus === 'playing' || this.gameStatus === 'paused') {
      // 重置游戏状态
      this.gameStatus = 'ready';
      this.gameTime = 0;
      this.zoomScale = 1;

      this.stopTimer();
      // 显示原始图片
      this.drawOriginalImage();
    }
  }

  zoom(isZoomIn = true) {
    if (this.gameStatus !== 'playing') {
      return;
    }
    if ((isZoomIn && this.zoomScale >= this.maxZoom) || (!isZoomIn && this.zoomScale <= this.minZoom)) {
      return;
    }

    const zoomChange = isZoomIn ? 1 + this.zoomStep : 1 / (1 + this.zoomStep);

    this.zoomScale = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoomScale * zoomChange));

    // 重绘拼图
    this.renderPuzzle();
  }

  showFullImage() {
    if (this.scaledImage?.src) {
      this.imageService.preview([
        {
          src: this.scaledImage.src
        }
      ]);
    }
  }

  // 格式化时间显示
  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;

    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  private getImageSize() {
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = this.wallpaperWidth;
    let sourceHeight = this.wallpaperHeight;

    if (this.wallpaperRatio > this.puzzleRatio) {
      // 如果图片比例大于画布比例，需要裁剪图片宽度
      sourceWidth = this.wallpaperHeight * this.puzzleRatio;
      sourceX = (this.wallpaperWidth - sourceWidth) / 2;
    } else {
      // 如果图片比例小于画布比例，需要裁剪图片高度
      sourceHeight = this.wallpaperWidth / this.puzzleRatio;
      sourceY = (this.wallpaperHeight - sourceHeight) / 2;
    }

    return {
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight
    };
  }

  private initCanvas() {
    const canvas = this.canvasRef.nativeElement;
    const previewCanvas = this.previewRef.nativeElement;
    if (!canvas || !previewCanvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    const previewCtx = previewCanvas.getContext('2d');
    if (!ctx || !previewCtx) {
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = this.puzzleImage;
    img.onload = () => {
      this.originalImage = img;

      // 创建一个新的画布来存储缩放后的图片
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');

      // 设置临时画布的尺寸为拼图尺寸
      tempCanvas.width = this.puzzleWidth;
      tempCanvas.height = this.puzzleHeight;

      const { sourceWidth, sourceHeight, sourceX, sourceY } = this.getImageSize();

      if (tempCtx) {
        // 在临时画布上绘制缩放后的图片
        tempCtx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, this.puzzleWidth, this.puzzleHeight);

        // 创建新图片对象并保存缩放后的图片
        const scaledImg = new Image();
        scaledImg.src = tempCanvas.toDataURL();
        scaledImg.onload = () => {
          this.scaledImage = scaledImg;
          this.drawPreviewImage(previewCanvas, previewCtx);
          this.drawOriginalImage();
        };
      }
    };
    img.onerror = () => {
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
      ctx.fillStyle = '#ff0000';
      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('图片加载失败', this.canvasWidth / 2, this.canvasHeight / 2);
    };
  }

  // 设置拖拽事件
  private initCanvasEvents() {
    const canvas = this.canvasRef.nativeElement;
    if (!canvas) {
      return;
    }

    canvas.addEventListener('mousedown', this.handleMouseDown);
    canvas.addEventListener('mousemove', this.handleMouseMove);
    canvas.addEventListener('mouseup', this.handleMouseUp);
    canvas.addEventListener('mouseleave', this.handleMouseUp);

    // 触摸事件支持
    canvas.addEventListener('touchstart', this.handleTouchStart);
    canvas.addEventListener('touchmove', this.handleTouchMove);
    canvas.addEventListener('touchend', this.handleTouchEnd);

    // 添加鼠标滚轮事件监听
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
  }

  private initPuzzle() {
    if (this.scaledImage) {
      const canvas = this.canvasRef.nativeElement;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        this.createPuzzle(canvas, ctx);
      }
    }
  }

  private createPuzzle(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    // 获取当前难度级别的行列数
    const { rows, cols } = this.difficultyLevels[this.activeDifficulty];

    // 设置锯齿参数
    this.jigsawService.setSeed(this.seed);
    this.jigsawService.setTabSize(this.tabSize);
    this.jigsawService.setJitter(this.jitter);

    // 重置缩放比例
    this.zoomScale = 1;

    // 生成拼图块
    this.puzzlePieces = shuffle(
      this.jigsawService.generatePuzzlePieces(
        this.canvasWidth,
        this.canvasHeight,
        this.puzzleWidth,
        this.puzzleHeight,
        rows,
        cols
      )
    );

    // 重置连接组
    this.connectedGroups = [];

    // 绘制拼图
    this.renderPuzzle(canvas, ctx);
  }

  private renderPuzzle(canvas?: HTMLCanvasElement, ctx?: CanvasRenderingContext2D) {
    canvas = canvas || this.canvasRef.nativeElement;
    ctx = ctx || canvas.getContext('2d') || undefined;

    if (ctx) {
      this.drawPuzzle(ctx);
    }
  }

  private drawPuzzle(ctx: CanvasRenderingContext2D) {
    const centerX = this.canvasWidth / 2;
    const centerY = this.canvasHeight / 2;

    // 清空画布
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    ctx.save();
    // 缩放
    ctx.translate(centerX, centerY);
    ctx.scale(this.zoomScale, this.zoomScale);
    ctx.translate(-centerX, -centerY);

    // 直接绘制每个拼图块
    this.puzzlePieces.forEach((piece) => {
      // 保存当前绘图状态
      ctx.save();

      // 移动到拼图块的显示位置
      ctx.translate(-piece.x, -piece.y);
      ctx.translate(piece.displayX, piece.displayY);

      // 创建并应用裁剪路径
      const path = new Path2D(piece.path);
      ctx.clip(path);

      // 绘制缩放后的图像
      ctx.drawImage(
        this.scaledImage!,
        0,
        0,
        this.puzzleWidth,
        this.puzzleHeight,
        0,
        0,
        this.puzzleWidth,
        this.puzzleHeight
      );

      // 恢复绘图状态
      ctx.restore();

      // 绘制边框以便于识别拼图块
      ctx.save();
      ctx.translate(-piece.x, -piece.y);
      ctx.translate(piece.displayX, piece.displayY);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.lineWidth = 1 / this.zoomScale;
      ctx.stroke(path);
      ctx.restore();
    });

    ctx.restore();
  }

  private drawPreviewImage(previewCanvas: HTMLCanvasElement, previewCtx: CanvasRenderingContext2D) {
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.drawImage(
      this.scaledImage!,
      0,
      0,
      this.puzzleWidth,
      this.puzzleHeight,
      0,
      0,
      previewCanvas.width,
      previewCanvas.height
    );
  }

  // 在暂停状态下显示原始图片
  private drawOriginalImage(isStopped = true) {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');

    if (!ctx || !this.originalImage) {
      return;
    }

    const { sourceWidth, sourceHeight, sourceX, sourceY } = this.getImageSize();

    // 清空画布
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    // 绘制原始图片
    ctx.drawImage(
      this.originalImage,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      this.canvasWidth,
      this.canvasHeight
    );

    // 添加半透明遮罩和文字提示
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isStopped ? '游戏未开始' : '游戏已暂停', this.canvasWidth / 2, this.canvasHeight / 2);
  }

  // 处理鼠标按下事件
  private handleMouseDown = (e: MouseEvent) => {
    // 只有在游戏进行中才允许拖动拼图块或画布
    if (this.gameStatus !== 'playing') {
      return;
    }

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 尝试选择拼图块
    const pieceSelected = this.checkPieceSelection(mouseX, mouseY);

    // 如果没有选中拼图块，则进入画布拖拽模式
    if (!pieceSelected) {
      this.isCanvasDragging = true;
      this.lastDragX = mouseX;
      this.lastDragY = mouseY;
    }
  };

  // 处理鼠标移动事件
  private handleMouseMove = (e: MouseEvent) => {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 拖拽拼图块
    if (this.isDragging && this.selectedPiece) {
      this.dragPiece(mouseX, mouseY);
      return;
    }
    // 拖拽画布
    if (this.isCanvasDragging) {
      this.dragCanvas(mouseX, mouseY);
    }
  };

  // 处理鼠标释放事件
  private handleMouseUp = () => {
    if (this.isDragging && this.selectedPiece) {
      // 在松开鼠标时检查吸附
      const selectedGroup = this.findConnectedGroup(this.selectedPiece);

      this.checkForSnapping(selectedGroup || [this.selectedPiece]);
      // 重绘拼图以显示吸附效果
      this.renderPuzzle();
    }

    // 重置拖拽状态
    this.isDragging = false;
    this.selectedPiece = null;
    this.isCanvasDragging = false;
  };

  // 处理触摸开始事件
  private handleTouchStart = (e: TouchEvent) => {
    e.preventDefault();

    // 只有在游戏进行中才允许拖动拼图块或画布
    if (this.gameStatus !== 'playing') {
      return;
    }

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;

    // 尝试选择拼图块
    const pieceSelected = this.checkPieceSelection(touchX, touchY);

    // 如果没有选中拼图块，则进入画布拖拽模式
    if (!pieceSelected) {
      this.isCanvasDragging = true;
      this.lastDragX = touchX;
      this.lastDragY = touchY;
    }
  };

  // 处理触摸移动事件
  private handleTouchMove = (e: TouchEvent) => {
    e.preventDefault();

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;

    // 拖拽拼图块
    if (this.isDragging && this.selectedPiece) {
      this.dragPiece(touchX, touchY);
      return;
    }
    // 拖拽画布
    if (this.isCanvasDragging) {
      this.dragCanvas(touchX, touchY);
    }
  };

  // 处理触摸结束事件
  private handleTouchEnd = (e: TouchEvent) => {
    e.preventDefault();

    if (this.isDragging && this.selectedPiece) {
      // 在触摸结束时检查吸附
      const selectedGroup = this.findConnectedGroup(this.selectedPiece);

      this.checkForSnapping(selectedGroup || [this.selectedPiece]);
      // 重绘拼图以显示吸附效果
      this.renderPuzzle();
    }

    // 重置拖拽状态
    this.isDragging = false;
    this.selectedPiece = null;
    this.isCanvasDragging = false;
  };

  // 处理鼠标滚轮事件
  private handleWheel = (e: WheelEvent) => {
    // 只有在游戏进行中才允许缩放
    if (this.gameStatus !== 'playing') {
      return;
    }

    // 阻止默认滚动行为
    e.preventDefault();

    // 根据滚轮方向决定放大或缩小
    if (e.deltaY < 0) {
      // 向上滚动，放大
      this.zoom();
    } else {
      // 向下滚动，缩小
      this.zoom(false);
    }
  };

  // 监听页面可见性变化
  private handleVisibilityChange = () => {
    if (document.hidden && this.gameStatus === 'playing') {
      // 页面不可见时暂停游戏
      this.pauseGame();
    }
  };

  // 拖拽画布
  private dragCanvas(x: number, y: number) {
    if (!this.isCanvasDragging) {
      return;
    }

    // 计算拖拽偏移量
    const deltaX = x - this.lastDragX;
    const deltaY = y - this.lastDragY;

    // 更新所有拼图块的位置
    this.puzzlePieces.forEach((piece) => {
      piece.displayX += deltaX;
      piece.displayY += deltaY;
    });

    // 更新上次拖拽位置
    this.lastDragX = x;
    this.lastDragY = y;

    // 重绘拼图
    this.renderPuzzle();
  }

  // 拖动拼图块
  private dragPiece(x: number, y: number) {
    if (!this.isDragging || !this.selectedPiece) {
      return;
    }

    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // 计算缩放后的坐标
    const centerX = this.canvasWidth / 2;
    const centerY = this.canvasHeight / 2;
    // 将鼠标坐标转换为缩放前的坐标系
    const scaledX = (x - centerX) / this.zoomScale + centerX;
    const scaledY = (y - centerY) / this.zoomScale + centerY;

    // 计算新位置，考虑缩放因素
    let newX = scaledX - this.dragOffsetX / this.zoomScale;
    let newY = scaledY - this.dragOffsetY / this.zoomScale;

    // 边界检查，考虑缩放因素
    // 在缩放后，边界检查需要考虑可视区域的变化
    const visibleWidth = this.canvasWidth / this.zoomScale;
    const visibleHeight = this.canvasHeight / this.zoomScale;
    const minX = centerX - visibleWidth / 2;
    const minY = centerY - visibleHeight / 2;
    const maxX = centerX + visibleWidth / 2 - this.selectedPiece.width;
    const maxY = centerY + visibleHeight / 2 - this.selectedPiece.height;

    // 调整边界检查，确保拼图块在可视区域内
    newX = Math.max(minX, Math.min(maxX, newX));
    newY = Math.max(minY, Math.min(maxY, newY));

    // 计算移动的偏移量
    const deltaX = newX - this.selectedPiece.displayX;
    const deltaY = newY - this.selectedPiece.displayY;

    // 找出当前选中拼图块所在的组
    const selectedGroup = this.findConnectedGroup(this.selectedPiece);

    // 移动组内所有拼图块
    if (selectedGroup) {
      selectedGroup.forEach((piece) => {
        piece.displayX += deltaX;
        piece.displayY += deltaY;
      });
    } else {
      // 如果没有找到组，只移动当前拼图块
      this.selectedPiece.displayX = newX;
      this.selectedPiece.displayY = newY;
    }

    // 重绘拼图
    this.renderPuzzle(canvas, ctx);
  }

  // 查找拼图块所在的连接组
  private findConnectedGroup(piece: any): any[] | null {
    for (const group of this.connectedGroups) {
      if (group.includes(piece)) {
        return group;
      }
    }
    return null;
  }

  // 检查是否可以与其他拼图块拼接
  private checkForSnapping(movingPieces: any[]) {
    if (!movingPieces.length) {
      return;
    }

    // 获取当前难度级别的行列数
    const { rows, cols } = this.difficultyLevels[this.activeDifficulty];
    const pieceWidth = this.puzzleWidth / cols;
    const pieceHeight = this.puzzleHeight / rows;

    // 根据缩放比例调整吸附阈值
    const adjustedSnapThreshold = this.snapThreshold / this.zoomScale;

    // 遍历所有拼图块，检查是否可以拼接
    const movingIds = movingPieces.map((p) => p.id);

    for (const movingPiece of movingPieces) {
      for (const piece of this.puzzlePieces) {
        // 跳过同一组的拼图块
        if (movingIds.includes(piece.id)) {
          continue;
        }

        // 检查是否是相邻的拼图块
        const isHorizontalNeighbor = Math.abs(movingPiece.col - piece.col) === 1 && movingPiece.row === piece.row;
        const isVerticalNeighbor = Math.abs(movingPiece.row - piece.row) === 1 && movingPiece.col === piece.col;

        if (isHorizontalNeighbor || isVerticalNeighbor) {
          // 计算理想位置（完全拼接时的位置）
          let idealX = 0;
          let idealY = 0;

          if (isHorizontalNeighbor) {
            // 水平相邻
            if (movingPiece.col < piece.col) {
              // 移动的拼图在左边
              idealX = piece.displayX - pieceWidth;
              idealY = piece.displayY;
            } else {
              // 移动的拼图在右边
              idealX = piece.displayX + pieceWidth;
              idealY = piece.displayY;
            }
          } else {
            // 垂直相邻
            if (movingPiece.row < piece.row) {
              // 移动的拼图在上边
              idealX = piece.displayX;
              idealY = piece.displayY - pieceHeight;
            } else {
              // 移动的拼图在下边
              idealX = piece.displayX;
              idealY = piece.displayY + pieceHeight;
            }
          }

          // 计算当前位置与理想位置的距离
          const distance = Math.sqrt(
            Math.pow(movingPiece.displayX - idealX, 2) + Math.pow(movingPiece.displayY - idealY, 2)
          );

          // 如果距离小于调整后的阈值，触发吸附
          if (distance < adjustedSnapThreshold) {
            // 计算需要移动的偏移量
            const offsetX = idealX - movingPiece.displayX;
            const offsetY = idealY - movingPiece.displayY;

            // 移动整个组
            for (const p of movingPieces) {
              p.displayX += offsetX;
              p.displayY += offsetY;
            }

            // 合并两个组
            this.mergeGroups(movingPieces, piece);

            // 只处理一次吸附，避免多次吸附导致位置错误
            return;
          }
        }
      }
    }
  }

  // 合并两个拼图组
  private mergeGroups(movingPieces: any[], targetPiece: any) {
    // 查找目标拼图块所在的组
    const targetGroup = this.findConnectedGroup(targetPiece);
    const movingGroup = this.findConnectedGroup(movingPieces[0]);

    if (targetGroup && movingGroup) {
      // 如果两个组都存在，合并它们
      if (targetGroup !== movingGroup) {
        // 从连接组数组中移除这两个组
        this.connectedGroups = this.connectedGroups.filter((group) => group !== targetGroup && group !== movingGroup);

        // 创建新的合并组
        const mergedGroup = [...targetGroup, ...movingGroup];
        this.connectedGroups.push(mergedGroup);
      }
    } else if (targetGroup) {
      // 如果只有目标组存在，将移动的拼图块添加到目标组
      targetGroup.push(...movingPieces);
    } else if (movingGroup) {
      // 如果只有移动组存在，将目标拼图块添加到移动组
      movingGroup.push(targetPiece);
    } else {
      // 如果两个组都不存在，创建新的组
      this.connectedGroups.push([...movingPieces, targetPiece]);
    }

    // 检查是否完成拼图
    this.checkPuzzleCompletion();
  }

  // 检查拼图是否完成
  private checkPuzzleCompletion() {
    const { rows, cols } = this.difficultyLevels[this.activeDifficulty];
    const totalPieces = rows * cols;

    // 如果只有一个组且包含所有拼图块，则拼图完成
    if (this.connectedGroups.length === 1 && this.connectedGroups[0].length === totalPieces) {
      // 停止计时器
      this.stopTimer();
      // 更新游戏状态
      this.gameStatus = 'completed';
      // 显示成功消息
      this.message.success(`恭喜！拼图完成！用时：${this.formatTime(this.gameTime)}`);
    }
  }

  // 检查是否选中拼图块
  private checkPieceSelection(x: number, y: number): boolean {
    const ctx = this.canvasRef.nativeElement.getContext('2d');
    if (!ctx) {
      return false;
    }

    // 计算缩放后的坐标
    const centerX = this.canvasWidth / 2;
    const centerY = this.canvasHeight / 2;
    // 将鼠标坐标转换为缩放前的坐标系
    const scaledX = (x - centerX) / this.zoomScale + centerX;
    const scaledY = (y - centerY) / this.zoomScale + centerY;

    // 从后向前检查（后绘制的在上层）
    for (let i = this.puzzlePieces.length - 1; i >= 0; i--) {
      const piece = this.puzzlePieces[i];
      // 创建路径并检查点是否在路径内
      const path = new Path2D(piece.path);

      // 使用缩放后的坐标检查点是否在路径内
      if (ctx.isPointInPath(path, scaledX + piece.x - piece.displayX, scaledY + piece.y - piece.displayY)) {
        // 将选中的拼图块及其所在组移到数组末尾（显示在最上层）
        const group = this.findConnectedGroup(piece);

        if (group) {
          // 如果是组的一部分，将整个组移到最上层
          const groupIds = group.map((p) => p.id);
          // 从数组中移除组内所有拼图块
          this.puzzlePieces = this.puzzlePieces.filter((p) => !groupIds.includes(p.id));
          // 将组内所有拼图块添加到数组末尾
          this.puzzlePieces.push(...group);
        } else {
          // 如果不是组的一部分，只移动当前拼图块
          this.puzzlePieces.splice(i, 1);
          this.puzzlePieces.push(piece);
        }

        this.isDragging = true;
        this.selectedPiece = piece;
        // 调整拖拽偏移量，考虑缩放因素
        this.dragOffsetX = (scaledX - piece.displayX) * this.zoomScale;
        this.dragOffsetY = (scaledY - piece.displayY) * this.zoomScale;

        // 重绘拼图
        this.renderPuzzle(this.canvasRef.nativeElement, ctx);

        return true;
      }
    }

    return false;
  }

  // 开始计时器
  private startTimer() {
    if (this.timerInterval) {
      window.clearInterval(this.timerInterval);
    }

    this.lastTimestamp = Date.now();
    this.timerInterval = window.setInterval(() => {
      const now = Date.now();
      const elapsed = Math.floor((now - this.lastTimestamp) / 1000);

      this.lastTimestamp = now;
      this.gameTime += elapsed;
    }, 1000);
  }

  // 停止计时器
  private stopTimer() {
    if (this.timerInterval) {
      window.clearInterval(this.timerInterval);

      this.timerInterval = null;
    }
  }
}
