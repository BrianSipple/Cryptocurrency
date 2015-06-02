var alice = new Client('alice');
var bob = new Client('bob');
var carl = new Client('carl');
var clients = [alice, bob, carl];

/*
 * DO NOT EDIT
 */
function Client(id) {
    this.id = id; // id == public key == address
    this.unusedValidTransactions = {}; // blockchain, contains SHAs // todo convert to array?
    this.unvalidatedTransactions = []; // need to validate these.
}

/*
 * params: clientId, amount
 * returns: Transaction
 * behavior: constructs a Transaction giving the amount to the clientId and the rest of the balance back to thisClient.
 */
Client.prototype.give = function give (clientId, amount) {

    var self = this,
        txn = new Transaction(self);

    // add all possible input transactions
    arrayify(self.unusedValidTransactions).forEach(function (inputTxn) {
        if (inputTxn.sumToDestination(self.id)) {
            txn.addInput(inputTxn);
        }
    });

    // add destination and amount
    txn.addOutput(clientId, amount);
    // send rest of input amount back to thisClient
    txn.addOutput(self.id, self.balance() - amount);
    self.broadcastTransaction(txn);

    return txn;


    // helper (DO NOT EDIT)
    function arrayify(obj) {
        return Object.keys(obj).reduce(function (result, key) {
            result.push(obj[key]);
            return result;
        }, []);
    }
};

/*
 * PLEASE EDIT
 * params: Transaction
 * returns: null
 * behavior: invokes onReceivingTransaction for each client in the global list of clients.
 */
Client.prototype.broadcastTransaction = function (transaction) {
    clients.forEach(function (client) {
        return client.onReceivingTransaction(transaction, transaction.sender.id);
    });
};
/*
 * dependencies: Client.prototype.verify
 * params: Transaction, String
 * returns: null
 * behavior: if the transaction is valid, adds it to unvalidatedTransactions.
 */
Client.prototype.onReceivingTransaction = function(transaction, senderId){
    if(this.verify(transaction)){
        console.log(this.id,'accepts transaction',transaction.id,'from',senderId);
        this.unvalidatedTransactions.push(transaction);
    } else {
        console.log(this.id,'rejects transaction',transaction.id,'from',senderId);
    }
};
/*
 * dependencies: Client.prototype.validateSolution
 * params: null
 * returns: Number
 * behavior: generates a solution to the proof-of-work problem (for which client.verify returns true) and broadcasts it along with unvalidated transactions to all clients.
 */
Client.prototype.mine = function(){
    var thisClient = this;
    var solution = 1;
    while(!thisClient.validateSolution(solution)){
        solution = Math.random();
    }
    thisClient.broadcastSolution(solution, thisClient.unvalidatedTransactions);
    return solution;
};
/*
 * params: Number, Transaction
 * returns: null
 * behavior: broadcasts solution, a copy of unvalidatedTransactions, and thisClient's id to all clients.
 */
Client.prototype.broadcastSolution = function(solution, transactions){
    var thisClient = this;
    console.log(thisClient.id,'broadcasts solution',solution,'to validate transactions', transactions);
    clients.forEach(function(client){
        client.onReceivingSolution(solution, transactions.slice(), thisClient.id); // slice to copy
    });
};
/*
 * params: Number, Transaction, String
 * returns: null
 * behavior: if solution and transactions are valid, generates a reward for the solver then invokes updateBlockchain.
 */
Client.prototype.onReceivingSolution = function (solution, transactions, solverId) {

    var thisClient = this;
    var areAllTransactionsValid = verifyAll(transactions);
    if( thisClient.validateSolution(solution) && areAllTransactionsValid ){
        console.log(this.id,'accepts solution',solution,'from',solverId);
        var rewardTxn = thisClient.generateRewardTransaction(solution, solverId, 10); // creates a transaction
        transactions.push(rewardTxn);
        updateBlockchain(transactions);
    } else {
        console.log(this.id,'rejects solution',solution,'from',solverId);
    }


    // helpers (DO NOT EDIT)
    function verifyAll(transactions) {
        return transactions.reduce(function (transactionsValid, transaction) {
            return transactionsValid && thisClient.verify(transaction);
        }, true);
    }

    function updateBlockchain(transactions) {
        transactions.forEach(function (transaction) {
            deleteUsedInputTransactions(transaction) // todo other dest?
            thisClient.unusedValidTransactions[transaction.id] = transaction;
            // clear txn from unvalidatedTransactions
            var i = thisClient.unvalidatedTransactions.indexOf(transaction);
            if (i >= 0) {
                thisClient.unvalidatedTransactions.splice(i, 1);
            }
        });
        function deleteUsedInputTransactions(transaction) {
            transaction.inputs.forEach(function (inputTransaction) {
                delete thisClient.unusedValidTransactions[inputTransaction.id];
            });
        }
    }
};
/*
 * params: null
 * returns: Number
 * behavior: iterates through unusedValidTransactions, summing the amounts transactions sent to thisClient.
 */
Client.prototype.balance = function () {
    var res = 0,
        self = this;

    Object.keys(self.unusedValidTransactions).forEach(function (transKey) {
        return self.unusedValidTransactions[transKey].outputs.forEach(function (output) {
            if (output.destination === self.id) {
                res += output.amount;
            }
        });
    });
    return res;
};
/*
 * params: Transaction
 * returns: Boolean
 * behavior: determines if Transaction's inputs and outputs are valid.
 */
Client.prototype.verify = function (transaction) {
    // each input must be valid, unused, and name the sender as a destination

    var inputsValid = transaction.inputsValid(this.unusedValidTransactions),
        outputValid = transaction.outputsValid();

    return inputsValid && outputValid;
};
/*
 * DO NOT EDIT
 */
Client.prototype.validateSolution = function (solution) {
    return solution < 0.2;
    //
};
/*
 * DO NOT EDIT
 */
Client.prototype.generateRewardTransaction = function (solution, id, amount) {
    var txn = new Transaction('coinbase', 'reward' + solution); // same SHA for a given solution
    txn.addOutput(id, amount);
    return txn;
};

/*
 * DO NOT EDIT any of the Transaction methods.
 */
function Transaction(sender) {
    this.sender = sender;
    this.id = 'transfer' + Math.random();
    this.inputs = [];
    this.outputs = [];
}
Transaction.prototype.addInput = function (inputTransaction) { //should be valid and unused
    this.inputs.push(inputTransaction);
    //
};
Transaction.prototype.addOutput = function (publicKey, amount) {
    this.outputs.push({amount: amount, destination: publicKey}); // destination can be thisClient
    //
};




///////// txn verification helper functions
Transaction.prototype.outputsValid = function () {
    var outputsSum = this.outputs.reduce(function (sum, output) {
        return sum += output.amount;
    }, 0);
    return this.inputsSumToSender(this.sender.id) - outputsSum >= 0;
    // todo make === not >= ; difference would be fee to miner
};
Transaction.prototype.inputsValid = function (unusedValidTransactions) {
    var sender = this.sender;
    // for each input
    return this.inputs.reduce(function (isValid, inputTransaction) {
        return isValid
                // input transaction is valid and hasn't been used to source another txn yet
            && unusedValidTransactions[inputTransaction.id]
                // input transactions sent > 0 coins to sender
            && inputTransaction.sumToDestination(sender.id) > 0;
    }, true);
};
Transaction.prototype.inputsSumToSender = function (clientId) {
    return this.inputs.reduce(function (sum, inputTransaction) {
        return sum += inputTransaction.sumToDestination(clientId);
    }, 0);
};
Transaction.prototype.sumToDestination = function (clientId) {
    return this.outputs.reduce(function (sum, output) {
        return sum += output.destination === clientId ? output.amount : 0;
    }, 0);
};

// var initialTxn = alice.generateRewardTransaction(0, 'alice', 10); // how does this really happen?
// alice.unusedValidTransactions[initialTxn.id] = initialTxn;
// bob.unusedValidTransactions[initialTxn.id] = initialTxn;
// carl.unusedValidTransactions[initialTxn.id] = initialTxn;
// console.log('alice given initial amount 10 via',initialTxn.id);

// alice.give('bob', 1);
// alice.give('carl', 2);
// alice.give('alice', 3);
// carl.mine();
