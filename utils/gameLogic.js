const calculateWinner = (squares, boardSize, lineLength) => {

    // helper to check a sequence of indices
    const checkLine = (indices) => {
        const firstSymbol = squares[indices[0]];
        if(!firstSymbol) return false;
        return indices.every(index => squares[index] === firstSymbol);
    }

    // All possible winning lines
    const lines = []

    const getIndex = (row, col) => row * boardSize + col;

    // Check rows 
    for (let row = 0; row < boardSize; row++){
        for(let col = 0; col <= boardSize - lineLength; col++){
            lines.push(
                Array.from({ length : lineLength }, (_, i) => getIndex(row, col + i))
            );
        }
    }

    // Check cols
    for(let col = 0; col < boardSize; col++) {
        for(let row = 0; row <= boardSize - lineLength; row++){
            lines.push(
                Array.from({ length : lineLength }, (_, i) => getIndex(row + i, col))
            );
        }
    }

    // Check diagonals(top left to bottom right)
    for(let row = 0; row <= boardSize - lineLength; row++){
        for(let col = 0; col <= boardSize - lineLength; col++){
            lines.push(
                Array.from({ length : lineLength }, (_, i) => getIndex(row + i, col + i))
            );
        }
    }

    // Check anti-diagonals(top right to bottom left)
    for(let row = 0; row <= boardSize - lineLength; row++) {
        for(let col = lineLength - 1; col < boardSize; col++){
            lines.push(
                Array.from({ length : lineLength }, (_, i) => getIndex(row + i, col - i))
            );
        }
    }

    // to check if any of the lines is a winning line
    for (let line of lines){
        if(checkLine(line)) {
            return { winner : squares[line[0]], winningLine : line } 
        }
    }

    // No winner
    return { winner : null, winningLine : [] };
}


const isDraw = (squares) => {
    return squares.every((square) => square !== null);
}


const isGameOverOnTime = (currentRound, totalRounds) => {
    return currentRound >= totalRounds;
}

const getTimeOverWinner = (xIsNext) => {
    return {
        winner : xIsNext ? "O" : "X",
        reason : "Time Over"
    }
}


const getRoundResult = ({winner, isDraw, round, reason }) => {
    if(winner) {
        return `Round ${round}: Winner - ${winner}${reason ? `(${reason})` : ""}`;
    }
    if(isDraw) {
        return `Round ${round}: Draw`;
    }
    return "";
}


module.exports = {
    calculateWinner,
    isDraw,
    isGameOverOnTime,
    getTimeOverWinner,
    getRoundResult,
}