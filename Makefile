# WyngAI Development Makefile

.PHONY: help install test lint format type-check clean setup-dev fetch-demo parse-demo

# Default target
help:
	@echo "WyngAI Development Commands"
	@echo "=========================="
	@echo ""
	@echo "Setup Commands:"
	@echo "  setup-dev     Set up development environment"
	@echo "  install       Install package in development mode"
	@echo ""
	@echo "Data Pipeline Commands:"
	@echo "  registry      Export source registry to Excel"
	@echo "  fetch-demo    Fetch sample data from key sources"
	@echo "  parse-demo    Parse sample data to normalized format"
	@echo "  clean-data    Clean all warehouse data"
	@echo ""
	@echo "Code Quality Commands:"
	@echo "  test          Run test suite"
	@echo "  lint          Run code linting"
	@echo "  format        Format code with black"
	@echo "  type-check    Run type checking"
	@echo "  check-all     Run all quality checks"
	@echo ""
	@echo "Docker Commands:"
	@echo "  docker-build  Build Docker image"
	@echo "  docker-run    Run Docker container"
	@echo ""
	@echo "Utility Commands:"
	@echo "  clean         Clean build artifacts"
	@echo "  demo          Run WyngAI demo"

# Development environment setup
setup-dev:
	@echo "Setting up WyngAI development environment..."
	python3 -m venv venv
	. venv/bin/activate && pip install --upgrade pip
	. venv/bin/activate && pip install -e ".[dev]"
	@echo "✅ Development environment ready!"
	@echo "Activate with: source venv/bin/activate"

install:
	pip install -e .

# Data pipeline commands
registry:
	@echo "Exporting source registry..."
	wyngai write-excel
	@echo "📊 Registry exported to data/registry/"

fetch-demo:
	@echo "Fetching demo data from key sources..."
	@echo "📋 Fetching eCFR sections..."
	wyngai fetch-ecfr --sections="title-45/part-147/section-147.136"
	@echo "✅ Demo fetch complete!"

parse-demo:
	@echo "Parsing demo data..."
	@echo "🔄 Parsing eCFR data..."
	# Add parsing commands when implemented
	@echo "✅ Demo parsing complete!"

clean-data:
	@echo "Cleaning warehouse data..."
	rm -rf warehouse/bronze/* warehouse/silver/* warehouse/gold/* || true
	@echo "🧹 Warehouse data cleaned!"

# Code quality commands
test:
	@echo "Running test suite..."
	pytest tests/ -v

lint:
	@echo "Running linting checks..."
	ruff check src/wyngai/
	@echo "✅ Linting complete!"

format:
	@echo "Formatting code..."
	black src/wyngai/ tests/
	@echo "✅ Code formatted!"

type-check:
	@echo "Running type checks..."
	mypy src/wyngai/
	@echo "✅ Type checking complete!"

check-all: lint type-check test
	@echo "✅ All quality checks passed!"

# Docker commands
docker-build:
	@echo "Building Docker image..."
	docker build -t wyngai:latest .

docker-run:
	@echo "Running Docker container..."
	docker run -it --rm -v $(PWD):/workspace wyngai:latest

# Utility commands
clean:
	@echo "Cleaning build artifacts..."
	rm -rf build/ dist/ *.egg-info/ .pytest_cache/ .mypy_cache/ __pycache__/
	find . -name "*.pyc" -delete
	find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
	@echo "🧹 Build artifacts cleaned!"

demo:
	@echo "Running WyngAI demo..."
	wyngai demo

# Development workflow shortcuts
dev-setup: setup-dev registry
	@echo "🚀 WyngAI development environment fully configured!"
	@echo ""
	@echo "Next steps:"
	@echo "1. Activate environment: source venv/bin/activate"
	@echo "2. Run demo: make demo"
	@echo "3. Fetch sample data: make fetch-demo"

quick-test: format lint
	@echo "🚀 Quick development checks complete!"

# Data pipeline shortcuts
full-pipeline: registry fetch-demo parse-demo
	@echo "🏁 Full demo pipeline complete!"

# Quality assurance
qa: clean format lint type-check test
	@echo "🎯 Quality assurance checks complete!"