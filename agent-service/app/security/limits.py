from app.models.schemas import ToolBudget


def can_spend(budget: ToolBudget, used_field: str, limit_field: str) -> bool:
    return int(getattr(budget, used_field)) < int(getattr(budget, limit_field))


def spend(budget: ToolBudget, used_field: str, amount: int = 1) -> ToolBudget:
    return budget.model_copy(update={used_field: int(getattr(budget, used_field)) + amount})

