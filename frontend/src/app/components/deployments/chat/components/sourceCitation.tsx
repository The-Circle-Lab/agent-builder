export default class SourceCitation {
  private fileName: string;
  private startingPage: number;

  constructor(fileName: string, startingPage: number = 1) {
    this.fileName = fileName;
    this.startingPage = startingPage;
  }

  public getFileName() {
    return this.fileName;
  }

  public getStartingPage() {
    return this.startingPage;
  }

  public render() {
    return (
      <button
        className="inline-flex items-center px-2 py-0.5 mx-0.5 my-0.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded text-xs font-normal text-black transition-colors duration-150 whitespace-nowrap"
        onClick={() => {
          // Handle source citation click
        }}
        title={`Source: ${this.fileName}`}
      >
        <svg
          className="w-3 h-3 mr-1 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <span className="truncate max-w-32">{this.fileName}</span>
      </button>
    );
  }
}
