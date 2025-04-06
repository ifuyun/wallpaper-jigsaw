import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { JigsawService } from './services/jigsaw.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, NzButtonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.less'
})
export class AppComponent implements OnInit, AfterViewInit {
  @ViewChild('puzzleCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  // 定义难度级别
  difficultyLevels = {
    master: { rows: 20, cols: 30 },
    expert: { rows: 16, cols: 24 },
    hard: { rows: 12, cols: 18 },
    medium: { rows: 8, cols: 12 },
    easy: { rows: 6, cols: 9 }
  };
  // 当前难度级别
  activeDifficulty: 'master' | 'expert' | 'hard' | 'medium' | 'easy' = 'medium';
  // 拼图块数组
  puzzlePieces: any[] = [];
  // 原始图片
  originalImage: HTMLImageElement | null = null;
  seed: number = Math.floor(Math.random() * 10000); // 随机种子
  // 锯齿参数
  tabSize: number = 20; // 锯齿大小百分比 (10-30)
  jitter: number = 4; // 锯齿抖动百分比 (0-13)

  // 拖拽相关变量
  isDragging: boolean = false;
  selectedPiece: any = null;
  dragOffsetX: number = 0;
  dragOffsetY: number = 0;

  constructor(private jigsawService: JigsawService) {}

  ngOnInit() {
    // 初始化代码
    this.jigsawService.setSeed(this.seed);
    this.jigsawService.setTabSize(this.tabSize);
    this.jigsawService.setJitter(this.jitter);
  }

  ngAfterViewInit() {
    this.initCanvas();
    this.initDragEvents();
  }

  // 设置拖拽事件
  private initDragEvents() {
    const canvas = this.canvasRef.nativeElement;

    canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));

    // 触摸事件支持
    canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
    canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
  }

  // 处理鼠标按下事件
  private handleMouseDown(e: MouseEvent) {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    this.checkPieceSelection(mouseX, mouseY);
  }

  // 处理鼠标移动事件
  private handleMouseMove(e: MouseEvent) {
    if (!this.isDragging || !this.selectedPiece) {
      return;
    }

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    this.dragPiece(mouseX, mouseY);
  }

  // 处理鼠标释放事件
  private handleMouseUp() {
    this.isDragging = false;
    this.selectedPiece = null;
  }

  // 处理触摸开始事件
  private handleTouchStart(e: TouchEvent) {
    e.preventDefault();
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;

    this.checkPieceSelection(touchX, touchY);
  }

  // 处理触摸移动事件
  private handleTouchMove(e: TouchEvent) {
    e.preventDefault();
    if (!this.isDragging || !this.selectedPiece) {
      return;
    }

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;

    this.dragPiece(touchX, touchY);
  }

  // 处理触摸结束事件
  private handleTouchEnd(e: TouchEvent) {
    e.preventDefault();
    this.isDragging = false;
    this.selectedPiece = null;
  }

  // 检查是否选中拼图块
  private checkPieceSelection(x: number, y: number) {
    const ctx = this.canvasRef.nativeElement.getContext('2d');
    if (!ctx) {
      return;
    }

    // 从后向前检查（后绘制的在上层）
    for (let i = this.puzzlePieces.length - 1; i >= 0; i--) {
      const piece = this.puzzlePieces[i];

      // 创建路径并检查点是否在路径内
      const path = new Path2D(piece.path);
      if (ctx.isPointInPath(path, x + piece.x - piece.displayX, y + piece.y - piece.displayY)) {
        // 将选中的拼图块移到数组末尾（显示在最上层）
        this.puzzlePieces.splice(i, 1);
        this.puzzlePieces.push(piece);

        this.isDragging = true;
        this.selectedPiece = piece;
        this.dragOffsetX = x - piece.displayX;
        this.dragOffsetY = y - piece.displayY;

        // 重绘拼图
        this.drawPuzzle(this.canvasRef.nativeElement, ctx);
        break;
      }
    }
  }

  // 拖动拼图块
  private dragPiece(x: number, y: number) {
    if (!this.isDragging || !this.selectedPiece) return;

    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // 计算新位置，确保在canvas边界内
    let newX = x - this.dragOffsetX;
    let newY = y - this.dragOffsetY;

    // 边界检查
    newX = Math.max(0, Math.min(canvas.width - this.selectedPiece.width, newX));
    newY = Math.max(0, Math.min(canvas.height - this.selectedPiece.height, newY));

    // 更新拼图块位置
    this.selectedPiece.displayX = newX;
    this.selectedPiece.displayY = newY;

    // 重绘拼图
    this.drawPuzzle(canvas, ctx);
  }

  // 切换难度级别
  setDifficulty(difficulty: 'master' | 'expert' | 'hard' | 'medium' | 'easy') {
    this.activeDifficulty = difficulty;

    if (this.originalImage) {
      const canvas = this.canvasRef.nativeElement;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        this.createPuzzlePieces(canvas, ctx);
      }
    }
  }

  // 设置锯齿参数
  setPuzzleParams(seed: number, tabSize: number, jitter: number) {
    this.seed = seed;
    this.tabSize = tabSize;
    this.jitter = jitter;

    if (this.originalImage) {
      const canvas = this.canvasRef.nativeElement;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        this.createPuzzlePieces(canvas, ctx);
      }
    }
  }

  private initCanvas() {
    const canvas = this.canvasRef.nativeElement;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = 'https://cn.bing.com/th?id=OHR.SummerSolstice2024_ZH-CN6141918663_1920x1080.jpg';
    img.onload = () => {
      this.originalImage = img;
      // 切分图片为拼图块
      this.createPuzzlePieces(canvas, ctx);
    };
    img.onerror = () => {
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ff0000';
      ctx.font = '24px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('图片加载失败', canvas.width / 2, canvas.height / 2);
    };
  }

  private getImageSize(canvas: HTMLCanvasElement) {
    // 计算居中裁剪的参数
    const imgWidth = this.originalImage!.width;
    const imgHeight = this.originalImage!.height;
    const imgRatio = imgWidth / imgHeight; // 16:9 = 1.78
    const canvasRatio = canvas.width / canvas.height; // 3:2 = 1.5

    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = imgWidth;
    let sourceHeight = imgHeight;

    if (imgRatio > canvasRatio) {
      // 如果图片比例大于画布比例，需要裁剪图片宽度
      sourceWidth = imgHeight * canvasRatio;
      sourceX = (imgWidth - sourceWidth) / 2;
    } else {
      // 如果图片比例小于画布比例，需要裁剪图片高度
      sourceHeight = imgWidth / canvasRatio;
      sourceY = (imgHeight - sourceHeight) / 2;
    }

    return {
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight
    };
  }

  private createPuzzlePieces(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    // 获取当前难度级别的行列数
    const { rows, cols } = this.difficultyLevels[this.activeDifficulty];

    // 设置锯齿参数
    this.jigsawService.setSeed(this.seed);
    this.jigsawService.setTabSize(this.tabSize);
    this.jigsawService.setJitter(this.jitter);

    // 使用JigsawService生成拼图块
    this.puzzlePieces = this.jigsawService.generatePuzzlePieces(canvas.width, canvas.height, rows, cols);

    // 绘制拼图效果
    this.drawPuzzle(canvas, ctx);
  }

  private drawPuzzle(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 直接绘制每个拼图块
    this.puzzlePieces.forEach((piece) => {
      // 保存当前绘图状态
      ctx.save();

      // 计算拼图块在原始图像中的位置
      const { sourceWidth, sourceHeight, sourceX, sourceY } = this.getImageSize(canvas);

      // 移动到拼图块的显示位置
      ctx.translate(-piece.x, -piece.y);
      ctx.translate(piece.displayX, piece.displayY);

      // 创建并应用裁剪路径
      const path = new Path2D(piece.path);
      ctx.clip(path);

      // 直接绘制原始图像的对应部分
      ctx.drawImage(
        this.originalImage!,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );
      // ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
      // ctx.fill(path);

      // 恢复绘图状态
      ctx.restore();

      // 绘制边框以便于识别拼图块
      ctx.save();
      ctx.translate(-piece.x, -piece.y);
      ctx.translate(piece.displayX, piece.displayY);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke(path);
      ctx.restore();
    });
  }
}
